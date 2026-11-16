// The match state machine of Harbour Line. A match runs menu → buy →
// play → round end → buy …, until one team has won 7 rounds. Vanguard
// attacks: it carries the charge and takes a round by planting it and
// letting it blow, or by eliminating Ember. Ember defends and takes a round
// by elimination, by running the clock out, or by defusing a planted
// charge. Kills, plants and round wins pay money; the buy phase spends it;
// losing rounds pay a streak bonus that grows with each loss in a row.
import * as THREE from 'three';
import { MAP } from './map.js';
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';

const ROUND_TIME = 100;
const BUY_TIME = 15;
const PLANT_TIME = 3;
const DEFUSE_TIME = 5;
const CHARGE_TIME = 35;
const WIN_ROUNDS = 7;
const MAX_ROUNDS = 13;

const KILL_PAY = 300;
const ROUND_WIN_PAY = 3250;
const ROUND_LOSS_BASE = 1900;
const LOSS_STREAK_STEP = 500;
const LOSS_STREAK_CAP = 1500;
const START_MONEY = 800;
const DEFUSE_RANGE = 2.2;
const ROUND_END_PAUSE = 2.2;

export function createMatch(deps) {
  const { player, bots, hud, audio } = deps;
  const state = {
    phase: 'menu',
    round: 1,
    scoreV: 0,
    scoreE: 0,
    money: START_MONEY,
    timeLeft: ROUND_TIME,
    buyLeft: BUY_TIME,
    planted: null, // {site, x, z, timer}
    carrier: 'player', // 'player' or a bot id
    lossStreak: 0,
    roundOver: false,
  };
  let channel = null; // the player's channel {type, progress, site}
  let roundEndedAt = 0;

  // Everyone still standing on a team, counting the player on Vanguard.
  function teamAlive(team) {
    const botCount = bots.aliveCount(team);
    const playerCount = team === 'vanguard' && player.state.alive ? 1 : 0;
    return botCount + playerCount;
  }

  function openRound() {
    state.phase = 'buy';
    state.buyLeft = BUY_TIME;
    state.timeLeft = ROUND_TIME;
    state.planted = null;
    state.roundOver = false;
    channel = null;
    player.respawn(MAP.vanguardSpawn[0]);
    // The charge goes to the player on odd rounds and to Rook on even ones.
    state.carrier = state.round % 2 === 1 ? 'player' : 'vanguard-0';
    bots.respawnAll(state.round, state.carrier);
    const carrierBot = bots.carrier();
    if (state.carrier === 'player') {
      hud.setCharge(true);
      hud.announce('You carry the charge — plant it at Site A or Site B');
    } else {
      hud.setCharge(false);
      if (carrierBot) hud.announce(`${carrierBot.name} carries the charge`);
    }
    hud.setScore(state.scoreV, state.scoreE, state.round);
    hud.setMoney(state.money);
    hud.setTimer(state.timeLeft);
    hud.setPlant(null);
    hud.showBuy(state.money, state.buyLeft);
    audio.tick();
  }

  function startMatch() {
    state.round = 1;
    state.scoreV = 0;
    state.scoreE = 0;
    state.money = START_MONEY;
    state.lossStreak = 0;
    openRound();
  }

  function showMatchResult() {
    const won = state.scoreV > state.scoreE;
    hud.showOverlay('match', {
      title: won ? 'MATCH WON — THE DOCK IS YOURS' : 'MATCH LOST',
      copy: `Final score — Vanguard ${state.scoreV} : ${state.scoreE} Ember. ${won ? 'Harbour Line will remember this one.' : 'The Ember team holds the dock. Run it back.'}`,
    });
    if (won) audio.roundWin();
    else audio.roundLose();
  }

  function endRound(winner, reason) {
    if (state.roundOver) return;
    state.roundOver = true;
    state.phase = 'roundEnd';
    roundEndedAt = 0;
    hud.hideBuy();
    hud.setPlant(null);
    if (winner === 'vanguard') {
      state.scoreV += 1;
      state.money += ROUND_WIN_PAY;
      state.lossStreak = 0;
      audio.roundWin();
    } else {
      state.scoreE += 1;
      state.money += ROUND_LOSS_BASE + Math.min(LOSS_STREAK_CAP, state.lossStreak * LOSS_STREAK_STEP);
      state.lossStreak += 1;
      audio.roundLose();
    }
    hud.setScore(state.scoreV, state.scoreE, state.round);
    hud.setMoney(state.money);
    const title = winner === 'vanguard' ? 'ROUND WON' : 'ROUND LOST';
    hud.showOverlay('round', {
      title,
      copy: `${reason} — Vanguard ${state.scoreV} : ${state.scoreE} Ember. $${state.money} in your pocket.`,
    });
    if (state.scoreV >= WIN_ROUNDS || state.scoreE >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
      showMatchResult();
    }
  }

  function nextRound() {
    if (state.phase === 'matchEnd') {
      startMatch();
      return;
    }
    state.round += 1;
    openRound();
  }

  function checkElimination() {
    if (state.roundOver || state.phase !== 'play') return;
    const vanguard = teamAlive('vanguard');
    const ember = teamAlive('ember');
    hud.setAlive(vanguard, ember);
    if (ember === 0) {
      endRound('vanguard', state.planted ? 'Charge detonated' : 'Ember team eliminated');
    } else if (vanguard === 0) {
      endRound('ember', 'Vanguard team eliminated');
    }
  }

  function onKill(killerTeam, killerName, victimTeam, victimName, headshot) {
    hud.killfeed(killerName, victimName, headshot, killerTeam);
    if (killerName === 'You') {
      state.money += KILL_PAY;
      hud.setMoney(state.money);
      audio.kill();
    }
    checkElimination();
  }

  // Spend money in the buy phase. Returns false when the purchase is
  // refused.
  function buy(itemId) {
    if (state.phase !== 'buy') return false;
    const item = itemId === 'grenade' ? GRENADE : itemId === 'armor' ? ARMOR : WEAPONS[itemId];
    if (!item || state.money < item.price) {
      audio.denied();
      hud.buyFlash(false);
      return false;
    }
    if (itemId === 'grenade') {
      if (deps.weaponState.grenades >= 2) {
        audio.denied();
        hud.buyFlash(false);
        return false;
      }
      deps.weaponState.grenades += 1;
    } else if (itemId === 'armor') {
      if (player.state.armor >= 50) {
        audio.denied();
        hud.buyFlash(false);
        return false;
      }
      player.state.armor = 50;
    } else {
      deps.equipWeapon(itemId);
    }
    state.money -= item.price;
    hud.setMoney(state.money);
    hud.showBuy(state.money, state.buyLeft);
    hud.buyFlash(true);
    audio.buy();
    return true;
  }

  // Which channel goal, if any, is available to the player right now?
  function channelGoal(playerPos) {
    if (!state.planted) {
      for (const siteKey of ['A', 'B']) {
        const site = MAP.sites[siteKey];
        const dist = Math.hypot(playerPos.x - site.x, playerPos.z - site.z);
        const inSite = dist < site.radius && state.carrier === 'player';
        if (inSite) return { type: 'plant', site: siteKey, need: PLANT_TIME };
      }
      return null;
    }
    const dist = Math.hypot(playerPos.x - state.planted.x, playerPos.z - state.planted.z);
    if (dist < DEFUSE_RANGE) {
      return { type: 'defuse', site: state.planted.site, need: DEFUSE_TIME };
    }
    return null;
  }

  function finishChannel(goal) {
    if (goal.type === 'plant') {
      const site = MAP.sites[goal.site];
      state.planted = { site: goal.site, x: site.x, z: site.z, timer: CHARGE_TIME };
      state.carrier = null;
      hud.setCharge(false);
      hud.announce('Charge planted — defend it!');
      audio.planted();
      state.money += KILL_PAY;
      hud.setMoney(state.money);
    } else {
      const site = state.planted.site;
      state.planted = null;
      hud.announce('Charge defused!');
      endRound('ember', `Charge at Site ${site} defused`);
    }
  }

  // Holding E near a site plants the charge; holding E near a planted
  // charge defuses it. Letting go, or stepping away, cancels the channel.
  function interact(dt, keys, playerPos) {
    if (state.phase !== 'play' || !player.state.alive) {
      channel = null;
      hud.setPlant(null);
      return;
    }
    const holding = keys.has('KeyE');
    const goal = channelGoal(playerPos);
    if (!goal || !holding) {
      if (channel) audio.denied();
      channel = null;
      hud.setPlant(null);
      return;
    }
    if (!channel || channel.type !== goal.type) {
      channel = { type: goal.type, progress: 0, site: goal.site };
    }
    channel.progress += dt / goal.need;
    const label = goal.type === 'plant' ? 'PLANTING CHARGE…' : 'DEFUSING CHARGE…';
    hud.setPlant(channel.progress, label);
    if (Math.random() < dt * 3) {
      if (goal.type === 'plant') audio.plantBeep();
      else audio.defuseBeep();
    }
    if (channel.progress >= 1) {
      finishChannel(goal);
      channel = null;
      hud.setPlant(null);
    }
  }

  function update(dt, now) {
    if (state.phase === 'buy') {
      state.buyLeft -= dt;
      hud.showBuy(state.money, Math.max(0, state.buyLeft));
      if (state.buyLeft <= 0) {
        state.phase = 'play';
        state.timeLeft = ROUND_TIME;
        hud.hideBuy();
        hud.announce(`Round ${state.round} — plant the charge or eliminate Ember`);
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      roundEndedAt += dt;
      if (roundEndedAt > ROUND_END_PAUSE) nextRound();
      return;
    }
    if (state.phase !== 'play') return;
    state.timeLeft -= dt;
    hud.setTimer(state.timeLeft, state.timeLeft <= 10);
    if (state.timeLeft <= 10.5 && state.timeLeft > 10.4) audio.tick();
    if (state.planted) {
      state.planted.timer -= dt;
      hud.setTimer(state.planted.timer, true);
      if (state.planted.timer <= 0) {
        deps.onChargeDetonated(state.planted);
        state.planted = null;
        endRound('vanguard', 'Charge detonated at the site');
        return;
      }
    }
    if (state.timeLeft <= 0) {
      endRound('ember', state.planted ? 'Time expired' : 'Time expired — charge never planted');
    }
  }

  // Find the site a bot is standing in, or null.
  function siteUnder(bot) {
    for (const key of ['A', 'B']) {
      const site = MAP.sites[key];
      const d = Math.hypot(bot.position.x - site.x, bot.position.z - site.z);
      if (d < site.radius) return { key, site };
    }
    return null;
  }

  // The read-only view of the match the bot AI gets every step.
  function botContext(playerEye, playerSpeed) {
    return {
      sites: MAP.sites,
      planted: !!state.planted,
      plantSite(bot) {
        // A carrier bot standing inside a site may plant the charge there.
        const found = siteUnder(bot);
        return found ? found.site : null;
      },
      nearSite(bot) {
        const a = MAP.sites.A;
        const b = MAP.sites.B;
        const da = Math.hypot(bot.position.x - a.x, bot.position.z - a.z);
        const db = Math.hypot(bot.position.x - b.x, bot.position.z - b.z);
        return da < db ? a : b;
      },
      enemyLastX: playerEye.x,
      enemyLastZ: playerEye.z,
      enemiesOf(bot) {
        const list = [];
        if (bot.team === 'ember') {
          list.push({ isPlayer: true, alive: player.state.alive, eyePos: playerEye, speed: playerSpeed });
          for (const ally of bots.bots) {
            if (ally.team === 'vanguard' && ally.alive) {
              list.push({
                isPlayer: false,
                bot: ally,
                alive: true,
                eyePos: new THREE.Vector3(ally.position.x, ally.position.y + 1.5, ally.position.z),
                speed: 0,
              });
            }
          }
        } else {
          for (const enemy of bots.bots) {
            if (enemy.team === 'ember' && enemy.alive) {
              list.push({
                isPlayer: false,
                bot: enemy,
                alive: true,
                eyePos: new THREE.Vector3(enemy.position.x, enemy.position.y + 1.5, enemy.position.z),
                speed: 0,
              });
            }
          }
        }
        return list;
      },
    };
  }

  function onPlantedByBot(bot) {
    if (state.phase !== 'play' || state.planted) return;
    // Work out which site the bot is standing in.
    const found = siteUnder(bot);
    if (found) {
      state.planted = { site: found.key, x: found.site.x, z: found.site.z, timer: CHARGE_TIME };
      state.carrier = null;
      hud.setCharge(false);
      hud.announce(`Charge planted at Site ${found.key} — defuse it!`);
      audio.planted();
    }
  }

  function onDefusedByBot() {
    if (!state.planted) return;
    const site = state.planted.site;
    state.planted = null;
    hud.announce('Charge defused by Ember!');
    endRound('ember', `Charge at Site ${site} defused`);
  }

  return {
    state,
    startMatch,
    startRound: openRound,
    endRound,
    nextRound,
    onKill,
    interact,
    buy,
    update,
    botContext,
    teamAlive,
    onPlantedByBot,
    onDefusedByBot,
  };
}
