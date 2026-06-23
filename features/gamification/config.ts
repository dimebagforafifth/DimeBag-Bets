/**
 * The ship-default gamification config — a believable starter set the operator tunes
 * from the config pages. Everything in integer cents. Rewards are deliberately small
 * (it's free play); the operator scales prize pools/probabilities to taste.
 */

import type { GamificationConfig } from './types.js'

export function defaultGamificationConfig(): GamificationConfig {
  return {
    missions: [
      {
        id: 'daily-3-bets',
        title: 'Warm up',
        description: 'Place 3 bets today.',
        cadence: 'daily',
        metric: 'bets',
        target: 3,
        rewardCents: 50,
        xp: 30,
        enabled: true,
      },
      {
        id: 'daily-wager-2000',
        title: 'High roller',
        description: 'Wager $20 today.',
        cadence: 'daily',
        metric: 'wagered',
        target: 2000,
        rewardCents: 100,
        xp: 50,
        enabled: true,
      },
      {
        id: 'daily-2-wins',
        title: 'On a roll',
        description: 'Win 2 bets today.',
        cadence: 'daily',
        metric: 'wins',
        target: 2,
        rewardCents: 75,
        xp: 40,
        enabled: true,
      },
      {
        id: 'weekly-50-bets',
        title: 'Regular',
        description: 'Place 50 bets this week.',
        cadence: 'weekly',
        metric: 'bets',
        target: 50,
        rewardCents: 500,
        xp: 300,
        enabled: true,
      },
      {
        id: 'weekly-wager-50000',
        title: 'Whale watch',
        description: 'Wager $500 this week.',
        cadence: 'weekly',
        metric: 'wagered',
        target: 50000,
        rewardCents: 1000,
        xp: 500,
        enabled: true,
      },
    ],
    achievements: [
      {
        id: 'first-bet',
        title: 'First steps',
        description: 'Place your first bet.',
        badge: '🎲',
        metric: 'lifetimeBets',
        threshold: 1,
        rewardCents: 25,
        xp: 20,
        enabled: true,
      },
      {
        id: 'hundred-bets',
        title: 'Century',
        description: 'Place 100 bets.',
        badge: '💯',
        metric: 'lifetimeBets',
        threshold: 100,
        rewardCents: 500,
        xp: 250,
        enabled: true,
      },
      {
        id: 'wager-100k',
        title: 'Big spender',
        description: 'Wager $1,000 lifetime.',
        badge: '💸',
        metric: 'lifetimeWagered',
        threshold: 100000,
        rewardCents: 1000,
        xp: 400,
        enabled: true,
      },
      {
        id: 'level-10',
        title: 'Seasoned',
        description: 'Reach level 10.',
        badge: '⭐',
        metric: 'level',
        threshold: 10,
        rewardCents: 750,
        xp: 0,
        enabled: true,
      },
    ],
    wheel: {
      enabled: true,
      cooldownHours: 24,
      segments: [
        { id: 'w-0', label: 'Try again', rewardCents: 0, weight: 30 },
        { id: 'w-25', label: '$0.25', rewardCents: 25, weight: 30 },
        { id: 'w-50', label: '$0.50', rewardCents: 50, weight: 20 },
        { id: 'w-100', label: '$1.00', rewardCents: 100, weight: 12 },
        { id: 'w-500', label: '$5.00', rewardCents: 500, weight: 7 },
        { id: 'w-2500', label: '$25.00 JACKPOT', rewardCents: 2500, weight: 1 },
      ],
    },
    tournaments: [
      {
        id: 'weekly-wager-cup',
        name: 'Weekly Wager Cup',
        metric: 'wagered',
        // A rolling window the operator re-schedules; default is a wide-open week.
        startsAt: 0,
        endsAt: 4102444800000, // far future (2100) so the demo tournament is always live
        prizePoolCents: 10000,
        payoutPct: [0.5, 0.3, 0.2],
        enabled: true,
      },
    ],
  }
}
