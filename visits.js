/* ================= VISITS DATA URL ================= */

const VISITS_DONE_URL =
    "https://docs.google.com/spreadsheets/d/1_bIN8rphnHm2dy7tYxzTH5rk9k3g1mx6iWreECBcqno/gviz/tq?tqx=out:json&gid=253598079";

const VISITS_SCHEDULED_URL =
    "https://docs.google.com/spreadsheets/d/1_bIN8rphnHm2dy7tYxzTH5rk9k3g1mx6iWreECBcqno/gviz/tq?tqx=out:json&gid=658909632";

let visits = [];

/* ================= HELPERS ================= */

function parseDate(str) {
    if (!str) return null;

    // yyyy-mm-dd
    if (str.includes("-")) return new Date(str);

    // dd/mm/yyyy
    if (str.includes("/")) {
        const [d, m, y] = str.split("/");
        return new Date(y, m - 1, d);
    }

    return null;
}

function sameDay(a, b) {
    return a && b && a.toDateString() === b.toDateString();
}

function formatTime(value) {
    if (!value) return "-";

    // Already readable
    if (typeof value === "string" && !value.startsWith("Date(")) return value;

    // Extract HH MM from Google Date()
    const match = value.match(/Date\(\d+,\d+,\d+,(\d+),(\d+),/);
    if (!match) return "-";

    const h = Number(match[1]);
    const m = Number(match[2]);

    const d = new Date();
    d.setHours(h, m);

    return d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}

/* ================= FETCH VISITS ================= */

async function fetchVisits() {
    try {
        /* ===== DONE VISITS (SOURCE OF TRUTH) ===== */
        const doneRes = await fetch(VISITS_DONE_URL);
        const doneText = await doneRes.text();
        const doneJson = JSON.parse(doneText.substr(47).slice(0, -2));

        const doneVisits = (doneJson.table.rows || []).map(r => ({
            date: r.c[0]?.f || r.c[0]?.v || "",
            name: r.c[1]?.v || "",
            site: r.c[2]?.v || "",
            time: formatTime(r.c[3]?.v || ""),
            status: "Done",
            finalDate: parseDate(r.c[0]?.f || r.c[0]?.v)
        }));

        /* ===== SCHEDULED VISITS ===== */
        const schRes = await fetch(VISITS_SCHEDULED_URL);
        const schText = await schRes.text();
        const schJson = JSON.parse(schText.substr(47).slice(0, -2));

        const scheduledVisits = (schJson.table.rows || [])
            .map(r => {
                const visitDate = r.c[3]?.f || r.c[3]?.v || "";
                const reschedule = r.c[4]?.f || r.c[4]?.v || "";
                const statusRaw = (r.c[5]?.v || "Pending").trim();
                const reason = r.c[6]?.v || "";


                // ❌ Ignore rows marked Done here → avoid duplicates
                if (statusRaw.toLowerCase() === "done") return null;

                const finalDateStr = reschedule || visitDate;
                const finalDate = parseDate(finalDateStr);

                let status = statusRaw;

                if (reschedule) status = "Rescheduled";
                if (statusRaw.toLowerCase() === "cancel") status = "Cancelled";

                return {
                    entryDate: r.c[0]?.f || r.c[0]?.v || "",
                    name: r.c[1]?.v || "",
                    site: r.c[2]?.v || "",
                    visitDate,
                    reschedule,
                    time: "",
                    status,
                    reason,
                    finalDate
                };
            })
            .filter(Boolean);

        /* ===== MERGE ===== */
        visits = [...doneVisits, ...scheduledVisits];

        populateVisitMembers();
        renderVisits();
    } catch (err) {
        console.error("Visits fetch failed:", err);
    }
}

/* ================= MEMBER DROPDOWN ================= */

function populateVisitMembers() {
    const select = document.getElementById("visitMember");
    if (!select) return;

    const names = [...new Set(visits.map(v => v.name))];

    select.innerHTML = `<option value="">All Members</option>`;

    names.forEach(n => {
        const opt = document.createElement("option");
        opt.value = n;
        opt.textContent = n;
        select.appendChild(opt);
    });
}

/* ================= FILTER + RENDER ================= */

function renderVisits() {
    const body = document.getElementById("visitsBody");
    if (!body) return;

    const range = document.getElementById("visitRange")?.value || "all";
    const member = document.getElementById("visitMember")?.value;
    const status = document.getElementById("visitStatus")?.value;
    const startVal = document.getElementById("visitStart")?.value;
    const endVal = document.getElementById("visitEnd")?.value;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let data = [...visits];

    /* ===== CUSTOM DATE RANGE (highest priority) ===== */
    if (startVal && endVal) {
        const start = new Date(startVal);
        const end = new Date(endVal);
        end.setHours(23, 59, 59, 999);

        data = data.filter(v => v.finalDate >= start && v.finalDate <= end);
    }

    /* ===== QUICK RANGE ===== */
    else if (range === "today") {
        data = data.filter(v => sameDay(v.finalDate, today));
    }

    else if (range === "week") {
        const start = new Date(today);
        const day = start.getDay() || 7;
        start.setDate(start.getDate() - day + 1);

        const end = new Date(start);
        end.setDate(start.getDate() + 6);

        data = data.filter(v => v.finalDate >= start && v.finalDate <= end);
    }

    else if (range === "month") {
        data = data.filter(
            v =>
                v.finalDate.getMonth() === today.getMonth() &&
                v.finalDate.getFullYear() === today.getFullYear()
        );
    }

    /* ===== MEMBER FILTER ===== */
    if (member) data = data.filter(v => v.name === member);

    /* ===== STATUS FILTER ===== */
    if (status) data = data.filter(v => v.status === status);

    /* ===== SUMMARY ===== */
    const done = data.filter(v => v.status === "Done").length;
    const pending = data.filter(v => v.status === "Pending").length;
    const rescheduled = data.filter(v => v.status === "Rescheduled").length;
    const cancelled = data.filter(v => v.status === "Cancelled").length;

    // Scheduled = Pending + Rescheduled
    const scheduled = pending + rescheduled;

    document.getElementById("visitDone").textContent = done;
    document.getElementById("visitPending").textContent = pending;
    document.getElementById("visitRescheduled").textContent = rescheduled;
    document.getElementById("visitCancelled").textContent = cancelled;
    document.getElementById("visitScheduled").textContent = scheduled;
    document.getElementById("visitTotal").textContent = data.length;


    /* ===== TABLE ===== */
    if (!data.length) {
        body.innerHTML = `<tr><td colspan="5">No visits found</td></tr>`;
        return;
    }

    body.innerHTML = data
        .sort((a, b) => a.finalDate - b.finalDate)
        .map(v => `
      <tr>
        <td>${v.entryDate || v.date || "-"}</td>
        <td>${v.name}</td>
        <td>${v.site}</td>
        <td>${v.reschedule || v.visitDate || v.time || "-"}</td>
        <td>
  ${v.status === "Cancelled" && v.reason
                ? `Cancelled (${v.reason})`
                : v.status}
</td>

      </tr>
    `)
        .join("");
}

/* ================= RESET ================= */

document.getElementById("visitReset")?.addEventListener("click", () => {
    document.getElementById("visitStart").value = "";
    document.getElementById("visitEnd").value = "";
    document.getElementById("visitRange").value = "all";
    document.getElementById("visitMember").value = "";
    document.getElementById("visitStatus").value = "";

    renderVisits();
});

/* ================= EVENTS ================= */

["visitRange", "visitMember", "visitStatus", "visitStart", "visitEnd"]
    .forEach(id => {
        document.getElementById(id)?.addEventListener("change", renderVisits);
    });

/* ================= INIT ================= */

fetchVisits();
