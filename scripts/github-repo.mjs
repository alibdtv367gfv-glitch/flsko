const token = process.env.GITHUB_TOKEN?.trim();
if (!token) throw new Error("GITHUB_TOKEN is missing");
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
};
const meResponse = await fetch("https://api.github.com/user", { headers });
if (!meResponse.ok) throw new Error(`GitHub user lookup failed: ${meResponse.status}`);
const me = await meResponse.json();
const name = "flsko";
const existingResponse = await fetch(`https://api.github.com/repos/${me.login}/${name}`, { headers });
if (existingResponse.ok) {
  const repo = await existingResponse.json();
  if (!repo.private) throw new Error("A public repository named flsko already exists; refusing to expose the source.");
  console.log(JSON.stringify({ login: me.login, repo: repo.full_name, cloneUrl: repo.clone_url, created: false }));
  process.exit(0);
}
if (existingResponse.status !== 404) throw new Error(`GitHub repository lookup failed: ${existingResponse.status}`);
const createResponse = await fetch("https://api.github.com/user/repos", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ name, description: "Flsko — Syrian Arabic-first multi-model AI agent", private: true, has_issues: true, has_projects: false, has_wiki: false, auto_init: false }),
});
const body = await createResponse.text();
if (!createResponse.ok) throw new Error(`GitHub repository creation failed: ${createResponse.status} ${body.slice(0, 240)}`);
const repo = JSON.parse(body);
console.log(JSON.stringify({ login: me.login, repo: repo.full_name, cloneUrl: repo.clone_url, created: true }));
