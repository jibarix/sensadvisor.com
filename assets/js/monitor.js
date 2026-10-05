// Live Puerto Rico monitor, ported verbatim from the current root page
// (same allowlisted read-only views, same status thresholds and direction
// windows). Only the wrapper changed: an exported starter instead of an IIFE.
export function startMonitor() {
    var SB = "https://grovomkpsqgzakfuvuii.supabase.co";
    var KEY = "sb_publishable_-nryP1oOokVWjjn5pnxosA_gqTm2QiF";
    function sb(path) {
        return fetch(SB + "/rest/v1/" + path + "&apikey=" + KEY, { cache: "no-store" })
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    }
    function fmt(n) { return (Math.round(n)).toLocaleString("en-US"); }
    function iso(ms) { return new Date(ms).toISOString(); }
    // Reading in `rowsDesc` (newest-first) closest to `targetMs` from at or before it.
    function priorTo(rowsDesc, targetMs, tKey) {
        for (var i = 1; i < rowsDesc.length; i++) {
            if (new Date(rowsDesc[i][tKey]).getTime() <= targetMs) return rowsDesc[i];
        }
        return null;
    }
    function chg(arrow, text) { return '<span class="arrow">' + arrow + '</span> ' + text; }
    function num(value) {
        if (value == null || value === "") return null;
        var n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    function hhmm(iso) {
        var d = new Date(iso);
        if (isNaN(d)) return "";
        return "updated " + d.toLocaleTimeString("en-US", {
            timeZone: "America/Puerto_Rico", hour: "numeric", minute: "2-digit"
        }) + " AST";
    }
    function paint(id, valueHtml, sub, color, ts, changeHtml) {
        var el = document.getElementById(id); if (!el) return;
        el.querySelector(".mon-value").innerHTML = valueHtml;
        if (sub != null) el.querySelector(".mon-sub").textContent = sub;
        el.querySelector(".mon-dot").style.background = color;
        el.querySelector(".mon-ts").textContent = ts || "";
        var ch = el.querySelector(".mon-change");
        if (ch) ch.innerHTML = changeHtml || "";
    }
    function fail(id) {
        var el = document.getElementById(id); if (!el) return;
        el.querySelector(".mon-value").textContent = "feed unavailable";
        el.querySelector(".mon-dot").style.background = "#999";
        el.querySelector(".mon-ts").textContent = "";
        var ch = el.querySelector(".mon-change");
        if (ch) ch.innerHTML = "";
    }
    function loadGrid() {
        var since = iso(Date.now() - 2 * 3600 * 1000);
        return sb("v_outage_snapshots_slim?select=observed_at,snapshot&observed_at=gte." + since + "&order=observed_at.desc")
            .then(function (rows) {
                var r = rows && rows[0]; if (!r) throw 0;
                var t = (r.snapshot && r.snapshot.total) || {};
                var without = t.without || 0, total = t.total || 0, planned = t.planned || 0;
                var unplanned = Math.max(0, without - planned);
                var statusPct = total ? (unplanned / total * 100) : 0;
                var color = statusPct >= 10 ? "#e04343" : statusPct >= 3 ? "#e86235" : statusPct >= 1 ? "#faa72a" : "#76ad2a";
                // Direction over the last hour: are more or fewer clients without power?
                var change = "";
                var prev = priorTo(rows, new Date(r.observed_at).getTime() - 3600000, "observed_at");
                if (prev) {
                    var wPrev = (prev.snapshot && prev.snapshot.total && prev.snapshot.total.without) || 0;
                    var d = without - wPrev;
                    change = d > 0 ? chg("↑", fmt(d) + " more · last hour")
                           : d < 0 ? chg("↓", fmt(-d) + " fewer · last hour")
                           : chg("→", "steady · last hour");
                }
                paint("mon-grid",
                    "<strong>" + fmt(without) + "</strong> <small>without power</small>",
                    statusPct.toFixed(1) + "% unplanned", color, hhmm(r.observed_at), change);
            }).catch(function () { fail("mon-grid"); });
    }
    function loadGen() {
        var since = iso(Date.now() - 2 * 3600 * 1000);
        return Promise.all([
            sb("v_generation_latest?select=*"),
            sb("v_generation_units?select=mw"),
            sb("v_generation_metrics_history?select=observed_at,operating_reserve_mw&observed_at=gte." + since + "&order=observed_at.desc").catch(function () { return null; })
        ]).then(function (res) {
            var latest = res[0] && res[0][0]; if (!latest) throw 0;
            var m = latest.metrics || {};
            var gen = num(m.totalGeneration), cap = num(m.availableCapacityMw),
                opRes = num(m.operatingReserveMw), nextHr = num(m.nextHourMw);
            if (gen == null || opRes == null) throw 0;
            var n1 = (res[1] || []).reduce(function (a, u) {
                var v = num(u.mw);
                return v != null && v >= 1 && v > a ? v : a;
            }, 0) || null;
            var marginNext = (cap != null && nextHr != null) ? cap - nextHr : null;
            var label, color;
            if ((marginNext != null && marginNext < 0) || opRes < 50) {
                label = "Reserves critically low"; color = "#e04343";
            } else if ((n1 != null && opRes < n1) ||
                       (n1 != null && marginNext != null && marginNext < n1)) {
                label = "Thin reserves"; color = "#faa72a";
            } else {
                label = "Adequate reserves"; color = "#76ad2a";
            }
            // Direction over the last hour: operating-reserve movement.
            var change = "";
            var hist = res[2];
            if (hist && hist.length) {
                var resNow = num(hist[0].operating_reserve_mw);
                var prev = priorTo(hist, new Date(hist[0].observed_at).getTime() - 3600000, "observed_at");
                var resThen = prev ? num(prev.operating_reserve_mw) : null;
                if (resNow != null && resThen != null) {
                    var d = Math.round(resNow - resThen);
                    change = d > 0 ? chg("↑", "reserve +" + d + " MW · last hour")
                           : d < 0 ? chg("↓", "reserve −" + Math.abs(d) + " MW · last hour")
                           : chg("→", "reserve flat · last hour");
                }
            }
            paint("mon-gen",
                "<strong>" + fmt(gen) + "</strong> <small>MW generating &middot; " + fmt(opRes) + " MW operating reserve</small>",
                label, color, hhmm(latest.observed_at), change);
        }).catch(function () { fail("mon-gen"); });
    }
    function loadWater() {
        var since = iso(Date.now() - 26 * 3600 * 1000);
        return Promise.all([
            sb("v_reservoir_status?select=status,status_rank,measured_at"),
            sb("v_reservoir_history?select=site_no,measured_at,value&measured_at=gte." + since + "&order=measured_at.asc").catch(function () { return null; })
        ]).then(function (res) {
                var rows = res[0];
                if (!rows || !rows.length) throw 0;
                var total = rows.length;
                var ranked = rows.filter(function (r) { return r.status_rank != null; });
                if (!ranked.length) throw 0;
                var worst = ranked.reduce(function (a, r) { return Math.max(a, +r.status_rank); }, -1);
                var belowNormal = ranked.filter(function (r) { return +r.status_rank >= 2; });
                var nControl = ranked.filter(function (r) { return +r.status_rank >= 4; }).length;
                var nAdjust = ranked.filter(function (r) { return +r.status_rank === 3; }).length;
                var nWatch = ranked.filter(function (r) { return +r.status_rank === 2; }).length;
                var color = worst >= 4 ? "#e04343" : worst === 3 ? "#d1793f" : worst === 2 ? "#faa72a" : "#76ad2a";
                var value = belowNormal.length
                    ? "<strong>" + belowNormal.length + "</strong> <small>of " + total + " below normal</small>"
                    : "<strong>All " + total + "</strong> <small>within normal bands</small>";
                var bands = [];
                if (nControl) bands.push(nControl + " at Control or below");
                if (nAdjust) bands.push(nAdjust + " in Ajustes");
                if (nWatch) bands.push(nWatch + " in Observaci\u00f3n");
                var latest = ranked.reduce(function (a, r) {
                    var t = r.measured_at ? new Date(r.measured_at).getTime() : 0;
                    return t > a ? t : a;
                }, 0);
                // Direction over 24h (reservoirs move slowly, so a full day is the
                // right window vs. the last-hour reads on grid/generation). Count
                // how many sites rose vs. fell, ignoring sensor-level jitter.
                var change = "";
                var hist = res[1];
                if (hist && hist.length) {
                    var bySite = {};
                    for (var i = 0; i < hist.length; i++) {
                        var v = num(hist[i].value); if (v == null) continue;
                        var k = hist[i].site_no;
                        (bySite[k] = bySite[k] || []).push({ t: new Date(hist[i].measured_at).getTime(), v: v });
                    }
                    var up = 0, down = 0;
                    Object.keys(bySite).forEach(function (k) {
                        var s = bySite[k]; if (s.length < 2) return;
                        var last = s[s.length - 1], target = last.t - 24 * 3600000;
                        if (s[0].t > target) return;                 // not a full day of history yet
                        var best = s[0];
                        for (var j = 0; j < s.length; j++) { if (s[j].t <= target) best = s[j]; else break; }
                        var d = last.v - best.v, eps = Math.max(0.02, Math.abs(last.v) * 0.0005);
                        if (d > eps) up++; else if (d < -eps) down++;
                    });
                    change = down > up ? chg("\u2193", "trending lower \u00b7 24h")
                           : up > down ? chg("\u2191", "trending higher \u00b7 24h")
                           : chg("\u2192", "unchanged over 24h");
                }
                paint("mon-water", value,
                    bands.length ? bands.join(" \u00b7 ") : "at or above Seguridad",
                    color, latest ? hhmm(new Date(latest).toISOString()) : "", change);
            }).catch(function () { fail("mon-water"); });
    }
    function refreshAll() {
        var rf = document.getElementById("mon-refresh");
        Promise.all([loadGrid(), loadGen(), loadWater()]).then(function () {
            if (rf) rf.textContent = "";
        });
    }
    refreshAll();
    setInterval(refreshAll, 5 * 60 * 1000);
}
