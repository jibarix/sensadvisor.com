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
        v_reservoir_history:          { series: "reservoirs/history", compact: "reservoirs/history_compact", time: "measured_at" },
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

    // A release's files never change, so each is downloaded and parsed once per release however
    // many calls ask for it (the outages page asks for outages/live twice on load, and again on
    // every refresh that lands inside the same release). Only the small files of the current
    // release are kept; a new release empties the list.
    var docs = {}, docsRelease = null;
    function dataset(name) {
        return manifest().then(function (m) {
            var e = m.datasets && m.datasets[name];
            if (!e) throw new Error("public-data: " + name + " is not published");
            if (!m.release) return getJSON(e.path);
            if (m.release !== docsRelease) { docs = {}; docsRelease = m.release; }
            var path = e.path;
            if (!docs[path]) docs[path] = getJSON(path).catch(function (err) { delete docs[path]; throw err; });
            return docs[path];
        });
    }

    // A compact month file holds the same readings as that month's row file, as one pair of
    // arrays per site instead of one object per reading: each time is a step of dt * unit_ms
    // on from the one before, starting at t0. This turns it back into the rows the pages ask for.
    // The rows come back in the row file's order (measured_at, then site_no), so a query without
    // an explicit order (e.g. limit=1) gets the same row either way.
    function expand(doc, rows) {
        var unit = doc.unit_ms, sites = doc.sites || {}, out = [];
        Object.keys(sites).forEach(function (site) {
            var s = sites[site], t = s.t0;
            for (var i = 0; i < s.dt.length; i++) {
                t += s.dt[i];
                out.push({ site_no: site, measured_at: new Date(t * unit).toISOString(), value: s.v[i] });
            }
        });
        out.sort(function (a, b) {
            return a.measured_at < b.measured_at ? -1 : a.measured_at > b.measured_at ? 1
                 : a.site_no < b.site_no ? -1 : a.site_no > b.site_no ? 1 : 0;
        });
        for (var j = 0; j < out.length; j++) rows.push(out[j]);
    }

    // Rows of a monthly series from `sinceMs` on (all months when null), oldest month first.
    // `compact` names the same series published in the compact shape. It is used when the
    // manifest lists it, with the same row count, for every month asked for; otherwise the row
    // files are used, so a page works the same before and after the publisher writes compact files.
    function series(name, sinceMs, compact) {
        return manifest().then(function (m) {
            var months = (m.series && m.series[name]) || [];
            if (!months.length) throw new Error("public-data: " + name + " is not published");
            var wanted = months.filter(function (e) {
                var p = e.month.split("-");
                return sinceMs == null || Date.UTC(+p[0], +p[1], 1) > sinceMs;   // month end > since
            });
            var small = (compact && m.series[compact]) || [];
            var swapped = wanted.map(function (e) {
                for (var i = 0; i < small.length; i++) if (small[i].month === e.month && small[i].rows === e.rows) return small[i];
                return null;
            });
            if (swapped.every(Boolean)) wanted = swapped;
            return Promise.all(wanted.map(function (e) { return getJSON(e.path); }));
        }).then(function (docs) {
            var rows = [];
            docs.forEach(function (d) {
                if (d.sites) expand(d, rows);
                else for (var i = 0; i < d.rows.length; i++) rows.push(d.rows[i]);
            });
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

        // A caller asking for "the last liveHours" worked out `since` a moment before this runs,
        // so an exact comparison misses by milliseconds and the request falls through to the
        // month files. The live file is published with an hour more than liveHours (25 h for
        // outages/live), so a few minutes of slack still lands inside what it holds.
        var LIVE_SLACK_MS = 5 * 60000;
        // dataset() hands every caller the same parsed file, so each call gets its own array
        function own(d) { return d.rows.slice(); }
        var rowsP;
        if (src.dataset) rowsP = dataset(src.dataset).then(own);
        else if (src.live && since != null && since >= Date.now() - src.liveHours * 3600000 - LIVE_SLACK_MS)
            rowsP = dataset(src.live).then(own);
        else if (src.live && since == null && q.get("limit") === "1" && /\.desc/.test(q.get("order") || ""))
            rowsP = dataset(src.live).then(own);   // "the latest row"
        else rowsP = series(src.series, since, src.compact);

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
