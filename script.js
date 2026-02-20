const SHEET_JSON_URL =
  "https://docs.google.com/spreadsheets/d/1_bIN8rphnHm2dy7tYxzTH5rk9k3g1mx6iWreECBcqno/gviz/tq?tqx=out:json";


let allData = [];


/* ================= FETCH DATA ================= */
async function fetchData() {
  try {
    const res = await fetch(SHEET_JSON_URL);
    const text = await res.text();
    const json = JSON.parse(text.substr(47).slice(0, -2));
    const rows = json.table.rows || [];

    allData = rows.map(r => ({
      date: r.c[0]?.f || r.c[0]?.v || "",
      name: r.c[1]?.v || "",
      leads: Number(r.c[2]?.v || 0),
      calls: Number(r.c[3]?.v || 0),
      positive: Number(r.c[4]?.v || 0),
      scheduled: Number(r.c[5]?.v || 0),
      done: Number(r.c[6]?.v || 0),
      tokens: Number(r.c[7]?.v || 0),
    }));

    populateFilters();
    setTodayDefault();
    render();
  } catch (err) {
    console.error("Sheet fetch failed:", err);

    const body = document.getElementById("tableBody");
    if (body) {
      body.innerHTML = `
      <tr>
        <td colspan="8" style="color:#d93025; font-weight:500;">
          Unable to load data
        </td>
      </tr>
    `;
    }
  }

}


/* ================= POPULATE MEMBER FILTER ================= */
function populateFilters() {
  const names = [...new Set(allData.map(d => d.name).filter(Boolean))];
  const select = document.getElementById("nameFilter");
  if (!select) return;

  select.innerHTML = `<option value="">All Members</option>`;

  names.forEach(n => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    select.appendChild(opt);
  });
}

/* ================= DEFAULT = TODAY ================= */
function setTodayDefault() {
  const el = document.getElementById("quickFilter");
  if (el) el.value = "today";
}

/* ================= DATE HELPERS ================= */
function parseDate(str) {
  if (!str) return null;

  // yyyy-mm-dd (input type="date")
  if (str.includes("-")) {
    const d = new Date(str);
    return isNaN(d) ? null : d;
  }

  // dd/mm/yyyy (Google sheet)
  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length !== 3) return null;
    const d = new Date(parts[2], parts[1] - 1, parts[0]);
    return isNaN(d) ? null : d;
  }

  return null;
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return a.toDateString() === b.toDateString();
}

/* ================= FILTER LOGIC ================= */
function getFilteredData() {
  const quick = document.getElementById("quickFilter")?.value;
  const nameVal = document.getElementById("nameFilter")?.value;
  const startVal = document.getElementById("startDate")?.value;
  const endVal = document.getElementById("endDate")?.value;

  let filtered = [...allData];
  const today = new Date();

  /* ===== CUSTOM DATE RANGE ===== */
  if (startVal && endVal) {
    const start = new Date(startVal);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endVal);
    end.setHours(23, 59, 59, 999);

    filtered = filtered.filter(d => {
      const dDate = parseDate(d.date);
      return dDate && dDate >= start && dDate <= end;
    });
  }

  /* ===== QUICK FILTERS (only if custom not used) ===== */
  else if (quick === "today") {
    filtered = filtered.filter(d => sameDay(parseDate(d.date), today));
  }

  else if (quick === "week") {
    const start = new Date(today);
    const day = today.getDay() || 7;
    start.setDate(today.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    filtered = filtered.filter(d => {
      const dDate = parseDate(d.date);
      return dDate && dDate >= start && dDate <= end;
    });
  }

  else if (quick === "month") {
    filtered = filtered.filter(d => {
      const dDate = parseDate(d.date);
      return (
        dDate &&
        dDate.getMonth() === today.getMonth() &&
        dDate.getFullYear() === today.getFullYear()
      );
    });
  }

  /* ===== NAME FILTER ===== */
  if (nameVal) {
    filtered = filtered.filter(d => d.name === nameVal);
  }

  return filtered;
}


/* ================= RENDER ================= */
function render() {
  const quick = document.getElementById("quickFilter")?.value;
  const data = getFilteredData();

  let compareData = [];
  const today = new Date();

  if (quick === "today") {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    compareData = allData.filter(d => sameDay(parseDate(d.date), yesterday));
  }

  if (quick === "week") {
    const currentMonday = new Date(today);
    const day = today.getDay() || 7;
    currentMonday.setDate(today.getDate() - day + 1);
    currentMonday.setHours(0, 0, 0, 0);

    const startPrevWeek = new Date(currentMonday);
    startPrevWeek.setDate(currentMonday.getDate() - 7);

    const endPrevWeek = new Date(startPrevWeek);
    endPrevWeek.setDate(startPrevWeek.getDate() + 6);
    endPrevWeek.setHours(23, 59, 59, 999);

    compareData = allData.filter(d => {
      const dDate = parseDate(d.date);
      return dDate && dDate >= startPrevWeek && dDate <= endPrevWeek;
    });
  }


  if (quick === "month") {
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    compareData = allData.filter(d => {
      const dDate = parseDate(d.date);
      return dDate && dDate >= prevMonthStart && dDate <= prevMonthEnd;
    });
  }

  updateCards(data, compareData);
  updateTable(data);
  updateLeaderboard(data);
}

/* ================= CARDS ================= */
function calculateTrend(todayData, yesterdayData, key) {
  const todaySum = todayData.reduce((a, b) => a + (b[key] || 0), 0);
  const yesterdaySum = yesterdayData.reduce((a, b) => a + (b[key] || 0), 0);

  // both zero → no change
  if (yesterdaySum === 0 && todaySum === 0) {
    return { label: "0%", arrow: "—", class: "" };
  }

  // yesterday zero but today positive → NEW
  if (yesterdaySum === 0 && todaySum > 0) {
    return { label: "New", arrow: "↑", class: "up" };
  }

  const change = ((todaySum - yesterdaySum) / yesterdaySum) * 100;

  return {
    label: `${Math.abs(change).toFixed(0)}%`,
    arrow: change > 0 ? "↑" : change < 0 ? "↓" : "→",
    class: change > 0 ? "up" : change < 0 ? "down" : ""
  };
}



function updateCards(data, yesterdayData = []) {
  const sum = key => data.reduce((a, b) => a + (b[key] || 0), 0);

  const metrics = ["leads", "calls", "positive", "scheduled", "done", "tokens"];

  metrics.forEach(key => {
    const value = sum(key);
    const el = document.getElementById(key);
    if (!el) return;

    if (yesterdayData.length) {
      const trend = calculateTrend(data, yesterdayData, key);

      el.innerHTML = `
        ${value}
        <span class="trend ${trend.arrow === "↑" ? "up" : trend.arrow === "↓" ? "down" : ""}">
          ${trend.arrow} ${trend.label}
        </span>
      `;
    } else {
      el.textContent = value;
    }
  });

  const calls = sum("calls");
  const done = sum("done");
  const tokens = sum("tokens");

  const visitConv = calls ? ((done / calls) * 100).toFixed(1) : "0";
  const closeConv = done ? ((tokens / done) * 100).toFixed(1) : "0";

  const visitEl = document.getElementById("visitConv");
  const closeEl = document.getElementById("closeConv");

  if (visitEl) visitEl.textContent = visitConv + "%";
  if (closeEl) closeEl.textContent = closeConv + "%";
}

/* ================= TABLE ================= */
function updateTable(data) {
  const body = document.getElementById("tableBody");
  if (!body) return;

  if (!data.length) {
    body.innerHTML = "<tr><td colspan='8'>No data found</td></tr>";
    return;
  }

  body.innerHTML = data.map(d => `
    <tr>
      <td>${d.date}</td>
      <td>${d.name}</td>
      <td>${d.leads}</td>
      <td>${d.calls}</td>
      <td>${d.positive}</td>
      <td>${d.scheduled}</td>
      <td>${d.done}</td>
      <td>${d.tokens}</td>
    </tr>
  `).join("");
}

/* ================= LEADERBOARD ================= */
function updateLeaderboard(data) {
  const map = {};

  data.forEach(d => {
    if (!map[d.name]) {
      map[d.name] = { calls: 0, positive: 0, scheduled: 0, done: 0, tokens: 0 };
    }

    map[d.name].calls += d.calls;
    map[d.name].positive += d.positive;
    map[d.name].scheduled += d.scheduled;
    map[d.name].done += d.done;
    map[d.name].tokens += d.tokens;
  });

  const players = Object.entries(map).map(([name, v]) => {
    const score =
      (v.tokens * 100) +
      (v.done * 4) +
      (v.scheduled * 2) +
      (v.positive * 1);



    return {
      name,
      ...v,
      score,
      conversion: v.done ? (v.tokens / v.done) * 100 : 0
    };
  });


  const body = document.getElementById("leaderboardBody");
  if (!body) return;

  if (!players.length) {
    body.innerHTML = "<tr><td colspan='7'>No data</td></tr>";
    return;
  }

  players.sort((a, b) => {

    // 1️⃣ Tokens decide rank (MOST IMPORTANT)
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;

    // 2️⃣ Higher Visit Done wins
    if (b.done !== a.done) return b.done - a.done;

    // 3️⃣ Higher Visit Scheduled wins
    if (b.scheduled !== a.scheduled) return b.scheduled - a.scheduled;

    // 4️⃣ Higher Positive calls wins
    if (b.positive !== a.positive) return b.positive - a.positive;

    // 5️⃣ Final tie → more calls
    return b.calls - a.calls;
  });



  const mostCalls = [...players].sort((a, b) => b.calls - a.calls)[0];
  // check if ANYONE has token > 0
  const hasTokenCloser = players.some(p => p.tokens > 0);


  body.innerHTML = players.map((p, i) => {
    let medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1;

    let badges = "";
    if (mostCalls && p.name === mostCalls.name) badges += `<span class="badge calls">📞 Most Calls</span>`;
    if (hasTokenCloser && i === 0 && p.tokens > 0)
      badges += `<span class="badge closer">🏆 Top Closer</span>`;

    return `
      <tr>
        <td class="rank">${medal}</td>
        <td class="name">${p.name}<div class="badges">${badges}</div></td>
        <td>${p.calls}</td>
        <td>${p.positive}</td>
        <td>${p.scheduled}</td>
        <td>${p.done}</td>
        <td>${p.tokens}</td>
      </tr>
    `;
  }).join("");
}

/* ================= MODAL ================= */
const leaderboardModal = document.getElementById("leaderboardModal");

document.getElementById("openLeaderboard")?.addEventListener("click", () => {
  if (leaderboardModal) leaderboardModal.style.display = "flex";
});

document.getElementById("closeLeaderboard")?.addEventListener("click", () => {
  if (leaderboardModal) leaderboardModal.style.display = "none";
});

window.addEventListener("click", e => {
  if (e.target === leaderboardModal) leaderboardModal.style.display = "none";
});


/* ================= FILTER LISTENERS ================= */
["quickFilter", "nameFilter"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", render);
});

["startDate", "endDate"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", () => {
    const quick = document.getElementById("quickFilter");
    if (quick) quick.value = "";
    render();
  });
});

document.getElementById("resetFilters")?.addEventListener("click", () => {

  // reset quick filter → default today
  const quick = document.getElementById("quickFilter");
  if (quick) quick.value = "today";

  // clear custom dates
  const start = document.getElementById("startDate");
  const end = document.getElementById("endDate");
  if (start) start.value = "";
  if (end) end.value = "";

  // reset member filter
  const name = document.getElementById("nameFilter");
  if (name) name.value = "";

  // re-render dashboard
  render();
});


/* ================= INIT ================= */
fetchData();
