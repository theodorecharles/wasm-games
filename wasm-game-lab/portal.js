'use strict';

const host = location.hostname || '127.0.0.1';
const shortcuts = document.querySelector('#shortcuts');

function isLaunchable(game) {
  return game.launchable !== false;
}

function urlFor(game) {
  if (!isLaunchable(game)) return null;
  return `http://${host}:${game.port}${game.path}`;
}

function openGame(game) {
  const url = urlFor(game);
  if (url) window.open(url, '_blank', 'noopener');
}

function renderGame(game) {
  const shortcut = document.createElement('button');
  shortcut.type = 'button';
  shortcut.className = `shortcut ${game.status === 'Live' ? 'live' : 'development'}${isLaunchable(game) ? '' : ' no-runtime'}`;
  const destination = urlFor(game) || game.runtimeNote;
  shortcut.title = `${game.title}\n${game.status}\n${game.family} · ${game.variant}\n${destination}`;
  if (!isLaunchable(game)) shortcut.setAttribute('aria-disabled', 'true');
  shortcut.innerHTML = '<img alt=""><span class="label"></span><span class="state" aria-hidden="true"></span>';
  shortcut.querySelector('img').src = `icons/${game.icon}`;
  shortcut.querySelector('.label').textContent = game.title;
  shortcut.addEventListener('click', () => {
    document.querySelectorAll('.shortcut.selected').forEach(node => node.classList.remove('selected'));
    shortcut.classList.add('selected');
  });
  shortcut.addEventListener('dblclick', () => openGame(game));
  shortcut.addEventListener('keydown', event => {
    if (event.key === 'Enter') openGame(game);
  });
  shortcuts.append(shortcut);
  game.element = shortcut;
}

async function probeEndpoint(game) {
  if (!isLaunchable(game)) return false;
  try {
    await fetch(`http://${host}:${game.port}/`, {
      cache: 'no-store',
      mode: 'no-cors',
      signal: AbortSignal.timeout(2500)
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function boot() {
  const response = await fetch('games.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`games.json: HTTP ${response.status}`);
  const games = await response.json();
  games.forEach(renderGame);

  const endpointGames = [...new Map(games.filter(isLaunchable).map(game => [game.service, game])).values()];
  const availability = new Map();
  await Promise.all(endpointGames.map(async game => {
    availability.set(game.service, await probeEndpoint(game));
  }));

  for (const game of games) {
    const launchable = isLaunchable(game);
    const reachable = launchable && availability.get(game.service);
    game.element.classList.toggle('reachable', reachable);
    game.element.classList.toggle('unreachable', !reachable);
    game.element.setAttribute('aria-description', launchable
      ? `${game.status}; endpoint ${reachable ? 'reachable' : 'unavailable'}`
      : `${game.status}; ${game.runtimeNote}`);
  }

  const count = [...availability.values()].filter(Boolean).length;
  const unavailableRuntimeCount = games.filter(game => !isLaunchable(game)).length;
  document.querySelector('#online-count').textContent = `${count} of ${availability.size} endpoints reachable · ${unavailableRuntimeCount} without runtime`;
}

boot().catch(error => {
  document.querySelector('#online-count').textContent = 'Portal inventory failed';
  console.error('[WASM Game Lab]', error);
});

function updateClock() {
  document.querySelector('#clock').textContent = new Intl.DateTimeFormat([], {
    hour: 'numeric', minute: '2-digit'
  }).format(new Date());
}

updateClock();
setInterval(updateClock, 15_000);
document.querySelector('#close-welcome').addEventListener('click', () => {
  document.querySelector('#welcome').hidden = true;
});
document.querySelector('#start').addEventListener('click', () => {
  const welcome = document.querySelector('#welcome');
  welcome.hidden = !welcome.hidden;
});
