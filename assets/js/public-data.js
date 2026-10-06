// Dashboard data, read from static JSON files instead of the database.
//
// The publisher (pr-energy-tracker supabase/functions/publish-public-data) writes the rows the
// dashboards show to the public Storage bucket `public-data` every 10 minutes: manifest.json names
// the current file for each dataset, and long histories are split into one file per UTC month.
// The pages need no key and cannot query anything; they can only download these files.
//
// PublicData.query(view, params) answers the same calls the pages used to send to the database
// (view name + PostgREST select / gte-lt filters / order / limit) from those files, so each page
// changed only its fetch helper. PublicData.home() returns the home monitor's small bundle.
(function () {
    var BASE = "https://grovomkpsqgzakfuvuii.supabase.co/storage/v1/object/public/public-data/";

    // view -> where it is published, and the column its history is split by
    var SOURCES = {
        v_outage_snapshots_slim:      { live: "outages/live", liveHours: 24, series: "outages/snapshots", time: "observed_at" },
        mv_outage_snapshots_slim:     { series: "outages/snapshots", time: "observed_at" },
        mv_outage_daily:              { dataset: "outages/daily" },
        v_generation_latest:          { dataset: "generation/latest" },
        v_generation_units:           { dataset: "generation/units" },
        v_generation_unit_stats:      { dataset: "generation/unit_stats" },
        v_generation_metrics_history: { series: "generation/metrics_history", time: "observed_at" },
        v_generation_cost_history:    { series: "generation/cost_history", time: "observed_at" },
        v_reservoir_status:           { dataset: "reservoirs/status" },
        v_reservoir_history:          { series: "reservoirs/history", time: "measured_at" },
        v_grid_risk_tiers:            { dataset: "grid_risk/tiers" },
        v_grid_risk_meta:             { dataset: "grid_risk/meta" }
    };

    function getJSON(path, revalidate) {
        return fetch(BASE + path, revalidate ? { cache: "no-cache" } : undefined).then(function (r) {
            if (!r.ok) throw new Error("public-data " + path + ": HTTP " + r.status);
            return r.json();
        });
    }

    // manifest.json changes every 10 minutes; release and month files never change once written,
    // so only the manifest is revalidated. One manifest per minute is shared by all calls.
    var manifestP = null, manifestAt = 0;
    function manifest() {
        if (!manifestP || Date.now() - manifestAt > 60000) {
            manifestAt = Date.now();
            manifestP = getJSON("manifest.json", true).catch(function (e) { manifestP = null; throw e; });
        }
        return manifestP;
    }

    function dataset(name) {
        return manifest().then(function (m) {
            var e = m.datasets && m.datasets[name];
            if (!e) throw new Error("public-data: " + name + " is not published");
            return getJSON(e.path);
        });
    }

    // Rows of a monthly series from `sinceMs` on (all months when null), oldest month first.
    function series(name, sinceMs) {
        return manifest().then(function (m) {
            var months = (m.series && m.series[name]) || [];
            if (!months.length) throw new Error("public-data: " + name + " is not published");
            var wanted = months.filter(function (e) {
                var p = e.month.split("-");
                return sinceMs == null || Date.UTC(+p[0], +p[1], 1) > sinceMs;   // month end > since
            });
            return Promise.all(wanted.map(function (e) { return getJSON(e.path); }));
        }).then(function (docs) {
            var rows = [];
            docs.forEach(function (d) { for (var i = 0; i < d.rows.length; i++) rows.push(d.rows[i]); });
            return rows;
        });
    }

    // Timestamps and dates compare as instants; everything else as numbers or strings.
    function key(v) {
        if (typeof v === "string" && /^\d{4}-\d\d-\d\d/.test(v)) { var t = Date.parse(v); if (!isNaN(t)) return t; }
        if (typeof v === "number") return v;
        if (v == null) return null;
        var n = Number(v);
        return v !== "" && isFinite(n) ? n : v;
    }
    var OPS = {
        gte: function (a, b) { return a >= b; }, gt: function (a, b) { return a > b; },
        lte: function (a, b) { return a <= b; }, lt: function (a, b) { return a < b; },
        eq: function (a, b) { return a === b; }
    };

    function query(view, params) {
        var src = SOURCES[view];
        if (!src) return Promise.reject(new Error("public-data: no published source for " + view));
        var q = new URLSearchParams(params || "");
        var filters = [], since = null;
        q.forEach(function (v, k) {
            if (k === "select" || k === "order" || k === "limit" || k === "offset") return;
            var dot = v.indexOf("."), op = v.slice(0, dot), arg = key(v.slice(dot + 1));
            if (!OPS[op]) throw new Error("public-data: unsupported filter " + k + "=" + v);
            filters.push({ col: k, op: OPS[op], arg: arg });
            if (src.time === k && (op === "gte" || op === "gt") && typeof arg === "number") since = arg;
        });

        var rowsP;
        if (src.dataset) rowsP = dataset(src.dataset).then(function (d) { return d.rows; });
        else if (src.live && since != null && since >= Date.now() - src.liveHours * 3600000)
            rowsP = dataset(src.live).then(function (d) { return d.rows; });
        else if (src.live && since == null && q.get("limit") === "1" && /\.desc/.test(q.get("order") || ""))
            rowsP = dataset(src.live).then(function (d) { return d.rows; });   // "the latest row"
        else rowsP = series(src.series, since);

        return rowsP.then(function (rows) {
            if (filters.length) rows = rows.filter(function (r) {
                for (var i = 0; i < filters.length; i++) {
                    var a = key(r[filters[i].col]);
                    if (a == null || !filters[i].op(a, filters[i].arg)) return false;
                }
                return true;
            });
            var order = q.get("order");
            if (order) {
                var spec = order.split(",").map(function (s) {
                    var p = s.split(".");
                    return { col: p[0], desc: p[1] === "desc" };
                });
                rows = rows.map(function (r, i) { return { r: r, i: i, k: spec.map(function (s) { return key(r[s.col]); }) }; })
                    .sort(function (a, b) {
                        for (var j = 0; j < spec.length; j++) {
                            var x = a.k[j], y = b.k[j];
                            if (x === y) continue;
                            if (x == null) return 1;          // nulls last in both directions
                            if (y == null) return -1;
                            var c = x < y ? -1 : 1;
                            return spec[j].desc ? -c : c;
                        }
                        return a.i - b.i;
                    })
                    .map(function (o) { return o.r; });
            }
            var offset = +q.get("offset") || 0, limit = q.get("limit");
            if (offset || limit) rows = rows.slice(offset, limit ? offset + +limit : undefined);
            var select = q.get("select");
            if (select && select !== "*") {
                var cols = select.split(",");
                rows = rows.map(function (r) {
                    var o = {};
                    cols.forEach(function (c) { if (c in r) o[c] = r[c]; });
                    return o;
                });
            }
            return rows;
        });
    }

    window.PublicData = {
        query: query,
        manifest: manifest,
        home: function () { return dataset("home/monitor"); }
    };
})();
