// tiendaUI.js - pantalla TIENDA (src/screens/tienda.html). Datos y monedero en tienda.js;
// las compras las valida Supabase a través de cloud.js.
import { ITEMS, getCoins, getItems } from './tienda.js';
import { currentUser, buyItem, setItemActive } from './cloud.js';

let busy = false;

export async function handleShopAction(action, btn, section) {
  if (busy || action !== 'shop-buy') return;
  const item = btn.dataset.item;
  const owned = item in getItems();
  busy = true;
  section.querySelectorAll('.shop-btn').forEach(b => { b.disabled = true; });
  const msg = section.querySelector('.shop-msg');
  msg.textContent = 'Un momento...'; msg.dataset.kind = 'info';
  try {
    // ya comprado: el botón activa / desactiva; si no, compra
    const r = owned ? await setItemActive(item, !getItems()[item]) : await buyItem(item);
    msg.textContent = r.message; msg.dataset.kind = r.ok ? 'ok' : 'error';
  } finally {
    busy = false;
    refreshShop(section);
  }
}

export function refreshShop(section) {
  if (!section || !section.dataset.loaded) return;
  const coins = getCoins(), items = getItems(), logged = !!currentUser();
  section.querySelector('.shop-coins').textContent = coins;
  section.querySelector('.shop-guest').hidden = logged;
  for (const [key, def] of Object.entries(ITEMS)) {
    const card = section.querySelector(`.shop-item[data-item="${key}"]`);
    if (!card) continue;
    const owned = key in items, active = items[key] === true;
    card.querySelector('.shop-name').textContent = def.name;
    card.querySelector('.shop-desc').textContent = def.desc;
    card.classList.toggle('owned', owned);
    card.classList.toggle('active', active);
    const btn = card.querySelector('.shop-btn');
    btn.textContent = !owned ? `${def.price}` : active ? 'ACTIVO' : 'INACTIVO';
    btn.classList.toggle('selected', owned && active);
    btn.classList.toggle('shop-price', !owned);
    btn.title = !owned ? `Comprar por ${def.price} CapoCoins` : active ? 'Pulsa para desactivarlo' : 'Pulsa para activarlo';
    btn.disabled = busy || !logged || (!owned && coins < def.price);
  }
}
