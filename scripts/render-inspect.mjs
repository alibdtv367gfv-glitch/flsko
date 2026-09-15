const headers = { Authorization: `Bearer ${process.env.RENDER_API_KEY}` };
const owners = await fetch("https://api.render.com/v1/owners?limit=100", { headers });
if (!owners.ok) throw new Error(`owners ${owners.status}`);
const ownerData = await owners.json();
console.log(JSON.stringify(ownerData.map((entry) => ({ id: entry.owner?.id ?? entry.id, name: entry.owner?.name ?? entry.name }))));
for (const entry of ownerData) {
  const id = entry.owner?.id ?? entry.id;
  if (!id) continue;
  const services = await fetch(`https://api.render.com/v1/services?ownerId=${encodeURIComponent(id)}&limit=100`, { headers });
  if (!services.ok) continue;
  const data = await services.json();
  console.log(JSON.stringify({ ownerId: id, services: data.map((item) => ({ id: item.service?.id ?? item.id, name: item.service?.name ?? item.name, url: item.service?.url ?? item.url })) }));
}
