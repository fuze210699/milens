function fetchData(url) {
  return fetch(url).then(r => r.json());
}

function formatItem(item) {
  return `<div class="item-card">${item.name}</div>`;
}
