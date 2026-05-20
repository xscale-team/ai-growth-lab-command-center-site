const STORAGE_KEY = "ai-growth-lab-command-center-v1";

const state = loadState();
hydrateState(state);

const views = document.querySelectorAll("[data-panel]");
const navItems = document.querySelectorAll(".nav-item");

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const view = item.dataset.view;
    navItems.forEach((nav) => nav.classList.toggle("is-active", nav === item));
    views.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === view));
  });
});

document.getElementById("exportJsonBtn").addEventListener("click", exportJson);
document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
document.getElementById("resetBtn").addEventListener("click", resetData);
document.getElementById("contentForm").addEventListener("submit", addContentResult);
document.getElementById("channelForm").addEventListener("submit", addTeamChannel);
document.getElementById("teachingForm").addEventListener("submit", addTeachingTopic);
document.getElementById("platformFilter").addEventListener("change", renderContentTable);
document.getElementById("sourceFilter").addEventListener("change", renderContentTable);
document.getElementById("teachingStatusFilter").addEventListener("change", renderTeachingList);
document.getElementById("teachingStageFilter").addEventListener("change", renderTeachingList);

render();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return structuredClone(window.dashboardSeed);
}

function hydrateState(target) {
  target.teamChannels = target.teamChannels || structuredClone(window.dashboardSeed.teamChannels || []);
  target.teachingTopics = target.teachingTopics || structuredClone(window.dashboardSeed.teachingTopics || []);
  target.content = target.content || [];
  target.content.forEach((post) => {
    post.owner = post.owner || inferOwner(post);
    post.channel = post.channel || inferChannel(post);
    post.url = post.url || "";
  });
}

function saveState() {
  state.meta.lastUpdated = new Date().toISOString().slice(0, 10);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  renderKpis();
  renderWeeklyLoop();
  renderPlatformChart();
  renderOwnerChart();
  renderChannelSummary();
  renderTeachNext();
  renderStageChart();
  renderActionQueue();
  renderWinnerList();
  renderFilters();
  renderContentTable();
  renderChannels();
  renderTeamWinnerList();
  renderTeachingFilters();
  renderTeachingList();
  renderGroupFeed();
  renderQuestionCloud();
  renderExperiments();
  renderIntegrations();
}

function renderKpis() {
  const totalViews = sum(state.content, "views");
  const totalEngagement = state.content.reduce((total, post) => total + engagement(post), 0);
  const totalJoins = sum(state.content, "joins");
  const openGroupPosts = state.groupPosts.filter((post) => post.status === "Needs reply").length;
  const clipsShipped = state.content.length;
  const engagementRate = totalViews ? (totalEngagement / totalViews) * 100 : 0;

  const kpis = [
    { label: "Content Views", value: compact(totalViews), detail: `${clipsShipped} tracked posts` },
    { label: "Engagement Rate", value: `${engagementRate.toFixed(1)}%`, detail: "Likes, comments, shares, saves" },
    { label: "Attributed Joins", value: compact(totalJoins), detail: "Manual or tracked estimate" },
    { label: "Needs Reply", value: openGroupPosts, detail: "Skool posts waiting on action" },
  ];

  document.getElementById("kpiGrid").innerHTML = kpis
    .map(
      (kpi) => `
        <article class="kpi-card">
          <span>${kpi.label}</span>
          <strong>${kpi.value}</strong>
          <p>${kpi.detail}</p>
        </article>
      `
    )
    .join("");
}

function renderWeeklyLoop() {
  document.getElementById("weeklyLoop").innerHTML = state.lives
    .map(
      (live) => `
        <article class="loop-item">
          <div class="day-badge">${live.day}</div>
          <div>
            <h3>${escapeHtml(live.title)}</h3>
            <p>${escapeHtml(live.deliverable)}</p>
            <small>${escapeHtml(live.next)}</small>
          </div>
          <span class="status ${statusClass(live.status)}">${escapeHtml(live.status)}</span>
        </article>
      `
    )
    .join("");
}

function renderPlatformChart() {
  const grouped = groupBy(state.content, "platform");
  const rows = Object.entries(grouped).map(([platform, posts]) => ({
    label: platform,
    views: posts.reduce((total, post) => total + post.views, 0),
    joins: posts.reduce((total, post) => total + post.joins, 0),
  }));
  const maxViews = Math.max(...rows.map((row) => row.views), 1);

  document.getElementById("platformChart").innerHTML = rows
    .sort((a, b) => b.views - a.views)
    .map((row) => {
      const width = Math.max(8, Math.round((row.views / maxViews) * 100));
      return `
        <div class="bar-row">
          <div class="bar-meta">
            <strong>${escapeHtml(row.label)}</strong>
            <span>${compact(row.views)} views / ${row.joins} joins</span>
          </div>
          <div class="bar-track"><span style="width:${width}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderOwnerChart() {
  const grouped = groupBy(state.content, "owner");
  const rows = Object.entries(grouped).map(([owner, posts]) => ({
    label: owner || "Unassigned",
    views: posts.reduce((total, post) => total + post.views, 0),
    joins: posts.reduce((total, post) => total + post.joins, 0),
    posts: posts.length,
  }));
  const maxViews = Math.max(...rows.map((row) => row.views), 1);
  const channelCount = state.teamChannels.length;
  const pill = document.getElementById("channelCountPill");
  if (pill) pill.textContent = `${channelCount} channels`;

  document.getElementById("ownerChart").innerHTML = rows
    .sort((a, b) => b.views - a.views)
    .map((row) => {
      const width = Math.max(8, Math.round((row.views / maxViews) * 100));
      return `
        <div class="bar-row">
          <div class="bar-meta">
            <strong>${escapeHtml(row.label)}</strong>
            <span>${compact(row.views)} views / ${row.joins} joins / ${row.posts} posts</span>
          </div>
          <div class="bar-track"><span style="width:${width}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderChannelSummary() {
  const connected = state.teamChannels.filter((channel) => /api|connected|ready/i.test(channel.status)).length;
  const needsWork = state.teamChannels.length - connected;
  document.getElementById("channelSummary").innerHTML = `
    <article class="summary-card">
      <span>Registered</span>
      <strong>${state.teamChannels.length}</strong>
      <p>Team and brand channels in the registry.</p>
    </article>
    <article class="summary-card">
      <span>Ready-ish</span>
      <strong>${connected}</strong>
      <p>Channels with an API-ready or connected status.</p>
    </article>
    <article class="summary-card">
      <span>Needs Auth</span>
      <strong>${needsWork}</strong>
      <p>Accounts that need OAuth, exports, or permissions.</p>
    </article>
  `;
}

function renderTeachNext() {
  const teachNext = rankedTeachingTopics().slice(0, 3);
  const teachNextCount = state.teachingTopics.filter((topic) => topic.status === "Teach next").length;
  const pill = document.getElementById("teachNextPill");
  if (pill) pill.textContent = `${teachNextCount} queued`;

  document.getElementById("teachNextList").innerHTML = teachNext
    .map(
      (topic) => `
        <article class="teaching-mini-item">
          <div>
            <span>${escapeHtml(topic.stage)} / ${escapeHtml(topic.type)}</span>
            <strong>${escapeHtml(topic.title)}</strong>
            <p>${escapeHtml(topic.evidence)}</p>
          </div>
          <b>${teachingScore(topic)}</b>
        </article>
      `
    )
    .join("");
}

function renderStageChart() {
  const grouped = groupBy(state.teachingTopics, "stage");
  const rows = Object.entries(grouped).map(([stage, topics]) => ({
    label: stage,
    count: topics.length,
    teachNext: topics.filter((topic) => topic.status === "Teach next").length,
  }));
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  document.getElementById("stageChart").innerHTML = rows
    .sort((a, b) => b.count - a.count)
    .map((row) => {
      const width = Math.max(8, Math.round((row.count / maxCount) * 100));
      return `
        <div class="bar-row">
          <div class="bar-meta">
            <strong>${escapeHtml(row.label)}</strong>
            <span>${row.count} topics / ${row.teachNext} teach next</span>
          </div>
          <div class="bar-track"><span style="width:${width}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderActionQueue() {
  document.getElementById("actionQueue").innerHTML = state.actions
    .map(
      (action) => `
        <article class="action-item">
          <span class="urgency ${action.urgency.toLowerCase()}">${escapeHtml(action.urgency)}</span>
          <div>
            <strong>${escapeHtml(action.label)}</strong>
            <p>${escapeHtml(action.owner)}</p>
          </div>
        </article>
      `
    )
    .join("");
}

function renderWinnerList() {
  document.getElementById("winnerList").innerHTML = [...state.content]
    .sort((a, b) => contentScore(b) - contentScore(a))
    .slice(0, 4)
    .map(
      (post, index) => `
        <article class="winner-item">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>${escapeHtml(post.title)}</strong>
            <p>${escapeHtml(post.hook)}</p>
          </div>
          <b>${contentScore(post)}</b>
        </article>
      `
    )
    .join("");
}

function renderFilters() {
  fillSelect("platformFilter", ["All platforms", ...unique(state.content.map((post) => post.platform))]);
  fillSelect("sourceFilter", ["All sources", ...unique(state.content.map((post) => post.source))]);
}

function renderContentTable() {
  const platform = document.getElementById("platformFilter").value;
  const source = document.getElementById("sourceFilter").value;
  const filtered = state.content.filter((post) => {
    const platformMatch = platform === "All platforms" || !platform || post.platform === platform;
    const sourceMatch = source === "All sources" || !source || post.source === source;
    return platformMatch && sourceMatch;
  });

  document.getElementById("contentTable").innerHTML = filtered
    .sort((a, b) => contentScore(b) - contentScore(a))
    .map(
      (post) => `
        <tr>
          <td>
            <strong>${escapeHtml(post.title)}</strong>
            <span>${escapeHtml(post.source)} / ${escapeHtml(post.format)}</span>
          </td>
          <td>${escapeHtml(post.owner)}</td>
          <td>${escapeHtml(post.platform)}</td>
          <td>${escapeHtml(post.channel)}</td>
          <td>${escapeHtml(post.hook)}</td>
          <td>${compact(post.views)}</td>
          <td>${compact(engagement(post))}</td>
          <td>${post.joins}</td>
          <td><span class="score">${contentScore(post)}</span></td>
          <td>${escapeHtml(post.next)}</td>
        </tr>
      `
    )
    .join("");
}

function renderChannels() {
  document.getElementById("channelGrid").innerHTML = state.teamChannels
    .map((channel) => {
      const posts = state.content.filter((post) => post.platform === channel.platform && post.channel === channel.handle);
      const views = posts.reduce((total, post) => total + post.views, 0);
      const joins = posts.reduce((total, post) => total + post.joins, 0);
      return `
        <article class="channel-card">
          <div class="channel-card-top">
            <div>
              <span>${escapeHtml(channel.platform)}</span>
              <strong>${escapeHtml(channel.handle)}</strong>
              <p>${escapeHtml(channel.owner)} / ${escapeHtml(channel.role || "Team channel")}</p>
            </div>
            <b>${escapeHtml(channel.priority || "P1")}</b>
          </div>
          <dl>
            <dt>Status</dt>
            <dd>${escapeHtml(channel.status)}</dd>
            <dt>Pull Method</dt>
            <dd>${escapeHtml(channel.pullMethod || "Manual")}</dd>
            <dt>Tracked Performance</dt>
            <dd>${compact(views)} views / ${joins} joins / ${posts.length} posts</dd>
            <dt>Last Pull</dt>
            <dd>${escapeHtml(channel.lastPulled || "Not connected")}</dd>
          </dl>
        </article>
      `;
    })
    .join("");
}

function renderTeamWinnerList() {
  document.getElementById("teamWinnerList").innerHTML = [...state.content]
    .sort((a, b) => contentScore(b) - contentScore(a))
    .slice(0, 6)
    .map(
      (post, index) => `
        <article class="winner-item">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>${escapeHtml(post.title)}</strong>
            <p>${escapeHtml(post.owner)} / ${escapeHtml(post.channel)} / ${escapeHtml(post.platform)}</p>
          </div>
          <b>${contentScore(post)}</b>
        </article>
      `
    )
    .join("");
}

function renderTeachingFilters() {
  fillSelect("teachingStatusFilter", ["All statuses", ...unique(state.teachingTopics.map((topic) => topic.status))]);
  fillSelect("teachingStageFilter", ["All stages", ...unique(state.teachingTopics.map((topic) => topic.stage))]);
}

function renderTeachingList() {
  const status = document.getElementById("teachingStatusFilter").value;
  const stage = document.getElementById("teachingStageFilter").value;
  const filtered = rankedTeachingTopics().filter((topic) => {
    const statusMatch = status === "All statuses" || !status || topic.status === status;
    const stageMatch = stage === "All stages" || !stage || topic.stage === stage;
    return statusMatch && stageMatch;
  });

  document.getElementById("teachingList").innerHTML = filtered
    .map(
      (topic) => `
        <article class="teaching-card">
          <div class="teaching-card-main">
            <div>
              <span>${escapeHtml(topic.stage)} / ${escapeHtml(topic.type)}</span>
              <strong>${escapeHtml(topic.title)}</strong>
              <p>${escapeHtml(topic.evidence)}</p>
            </div>
            <div class="teaching-score">
              <b>${teachingScore(topic)}</b>
              <small>priority</small>
            </div>
          </div>
          <dl>
            <dt>Status</dt>
            <dd><span class="status ${statusClass(topic.status)}">${escapeHtml(topic.status)}</span></dd>
            <dt>Source</dt>
            <dd>${escapeHtml(topic.source || "Manual")}</dd>
            <dt>Recommended Format</dt>
            <dd>${escapeHtml(topic.recommendedFormat || "Live segment")}</dd>
            <dt>Output</dt>
            <dd>${escapeHtml(topic.output || "Teaching asset")}</dd>
            <dt>Next Action</dt>
            <dd>${escapeHtml(topic.next)}</dd>
          </dl>
        </article>
      `
    )
    .join("");
}

function renderGroupFeed() {
  const unanswered = state.groupPosts.filter((post) => post.status === "Needs reply").length;
  document.getElementById("unansweredCount").textContent = `${unanswered} need action`;
  document.getElementById("groupFeed").innerHTML = state.groupPosts
    .map(
      (post) => `
        <article class="group-post">
          <div class="group-title">
            <span>${escapeHtml(post.category)}</span>
            <strong>${escapeHtml(post.title)}</strong>
          </div>
          <p>${escapeHtml(post.signal)}</p>
          <div class="group-footer">
            <span>${post.comments} comments / ${post.likes} likes</span>
            <b>${escapeHtml(post.action)}</b>
          </div>
        </article>
      `
    )
    .join("");
}

function renderQuestionCloud() {
  const questions = [
    "Which product should I launch first?",
    "Can Odyssey launch the ads?",
    "How do I name ad batches?",
    "When do I update the landing page?",
    "What signal matters before purchases?",
    "How do I use AI without generic ads?",
  ];

  document.getElementById("questionCloud").innerHTML = questions
    .map((question, index) => `<span class="question q-${index % 4}">${escapeHtml(question)}</span>`)
    .join("");
}

function renderExperiments() {
  document.getElementById("experimentGrid").innerHTML = state.experiments
    .map(
      (experiment) => `
        <article class="experiment-card">
          <div>
            <span>${escapeHtml(experiment.week)}</span>
            <strong>${escapeHtml(experiment.offer)}</strong>
          </div>
          <dl>
            <dt>Page</dt>
            <dd>${escapeHtml(experiment.page)}</dd>
            <dt>Ads</dt>
            <dd>${escapeHtml(experiment.ads)}</dd>
            <dt>Signal</dt>
            <dd>${escapeHtml(experiment.signal)}</dd>
          </dl>
          <p>${escapeHtml(experiment.next)}</p>
        </article>
      `
    )
    .join("");
}

function renderIntegrations() {
  document.getElementById("integrationList").innerHTML = state.integrations
    .map(
      (integration) => `
        <article class="integration-item">
          <div>
            <strong>${escapeHtml(integration.name)}</strong>
            <span>${escapeHtml(integration.note)}</span>
          </div>
          <div>
            <b>${escapeHtml(integration.priority)}</b>
            <em>${escapeHtml(integration.status)}</em>
          </div>
        </article>
      `
    )
    .join("");
}

function addContentResult(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const post = {
    id: `c-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    title: form.get("title"),
    owner: form.get("owner") || "Unassigned",
    channel: form.get("channel") || "Unassigned",
    platform: form.get("platform"),
    url: "",
    source: form.get("source"),
    format: "Manual log",
    hook: form.get("hook"),
    views: number(form.get("views")),
    likes: number(form.get("likes")),
    comments: number(form.get("comments")),
    shares: number(form.get("shares")),
    saves: number(form.get("saves")),
    joins: number(form.get("joins")),
    status: "Logged",
    next: form.get("next") || "Review next week",
  };
  state.content.unshift(post);
  saveState();
  event.currentTarget.reset();
  render();
}

function addTeamChannel(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const channel = {
    id: `ch-${Date.now()}`,
    owner: form.get("owner"),
    platform: form.get("platform"),
    handle: form.get("handle"),
    role: form.get("role") || "Team channel",
    status: "Needs connection",
    priority: "P1",
    pullMethod: form.get("pullMethod") || "Manual/export",
    lastPulled: "Not connected",
  };
  state.teamChannels.unshift(channel);
  saveState();
  event.currentTarget.reset();
  render();
}

function addTeachingTopic(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const topic = {
    id: `t-${Date.now()}`,
    title: form.get("title"),
    type: form.get("type"),
    status: "Teach next",
    stage: form.get("stage"),
    priority: form.get("priority"),
    demand: number(form.get("demand")) || 5,
    evidence: form.get("evidence") || "Manually captured team signal.",
    source: "Manual",
    recommendedFormat: form.get("type"),
    owner: "X Scale",
    scheduledFor: "Unscheduled",
    output: "Teaching asset",
    next: form.get("next") || "Decide whether this becomes a live segment, course lesson, FAQ, clip, or template.",
  };
  state.teachingTopics.unshift(topic);
  saveState();
  event.currentTarget.reset();
  render();
}

function exportJson() {
  downloadFile("ai-growth-lab-dashboard-data.json", JSON.stringify(state, null, 2), "application/json");
}

function exportCsv() {
  const headers = [
    "date",
    "title",
    "owner",
    "channel",
    "platform",
    "source",
    "hook",
    "url",
    "views",
    "likes",
    "comments",
    "shares",
    "saves",
    "joins",
    "score",
    "next",
  ];
  const rows = state.content.map((post) =>
    headers
      .map((header) => {
        const value = header === "score" ? contentScore(post) : post[header];
        return `"${String(value ?? "").replaceAll('"', '""')}"`;
      })
      .join(",")
  );
  downloadFile("ai-growth-lab-content-results.csv", `${headers.join(",")}\n${rows.join("\n")}`, "text/csv");
}

function resetData() {
  localStorage.removeItem(STORAGE_KEY);
  Object.assign(state, structuredClone(window.dashboardSeed));
  hydrateState(state);
  render();
}

function contentScore(post) {
  return Math.round(post.views / 100 + post.comments * 4 + post.shares * 6 + post.saves * 5 + post.joins * 20);
}

function rankedTeachingTopics() {
  return [...state.teachingTopics].sort((a, b) => teachingScore(b) - teachingScore(a));
}

function teachingScore(topic) {
  const priorityWeight = { P0: 30, P1: 18, P2: 8 }[topic.priority] || 8;
  const statusWeight = { "Teach next": 28, Planned: 18, Backlog: 10, Taught: 2 }[topic.status] || 10;
  return priorityWeight + statusWeight + number(topic.demand) * 7;
}

function engagement(post) {
  return post.likes + post.comments + post.shares + post.saves;
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function groupBy(items, key) {
  return items.reduce((grouped, item) => {
    const value = item[key];
    grouped[value] = grouped[value] || [];
    grouped[value].push(item);
    return grouped;
  }, {});
}

function unique(items) {
  return [...new Set(items)].sort();
}

function inferOwner(post) {
  if (post.platform === "YouTube Shorts") return "X Scale";
  if (post.source === "Founder Organic") return "Devin";
  return "X Scale";
}

function inferChannel(post) {
  if (post.platform === "YouTube Shorts") return "@xscale";
  if (post.platform === "Instagram Reels" && post.source === "Founder Organic") return "@devinmerkel";
  if (post.platform === "TikTok") return "@devinmerkel";
  return "@xscale";
}

function number(value) {
  return Number.parseInt(value, 10) || 0;
}

function compact(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function fillSelect(id, values) {
  const select = document.getElementById(id);
  const current = select.value;
  select.innerHTML = values.map((value) => `<option>${escapeHtml(value)}</option>`).join("");
  if (values.includes(current)) select.value = current;
}

function statusClass(status) {
  return status.toLowerCase().replaceAll(" ", "-").replaceAll("/", "-");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
