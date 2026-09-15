const token = process.env.GITHUB_TOKEN?.trim();
if (!token) throw new Error("GITHUB_TOKEN is missing");
const response = await fetch("https://api.github.com/user/repos?visibility=private&affiliation=owner&per_page=100", {
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  },
});
const body = await response.text();
if (!response.ok) throw new Error(`GitHub repository listing failed: ${response.status}`);
const repos = JSON.parse(body).map((repo) => ({ name: repo.name, fullName: repo.full_name, cloneUrl: repo.clone_url, private: repo.private }));
console.log(JSON.stringify(repos));
