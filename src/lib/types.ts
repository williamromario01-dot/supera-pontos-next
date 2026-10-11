export type UserRole =
  | 'super_admin'
  | 'company_admin'
  | 'admin'
  | 'educator'
  | 'student';

export type CompanyStatus =
  | 'pending_verification'
  | 'pending_payment'
  | 'active'
  | 'suspended'
  | 'rejected';

export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired';

export type BillingInterval = 'monthly' | 'yearly';

export interface Badge {
  name: string;
  threshold: number;
  color: string;
  icon: string;
}

export const BADGES: Badge[] = [
  {
    name: 'Bronze',
    threshold: 500,
    color: '#B45309',
    icon: '🥉',
  },
  {
    name: 'Prata',
    threshold: 1000,
    color: '#64748B',
    icon: '🥈',
  },
  {
    name: 'Ouro',
    threshold: 2500,
    color: '#D97706',
    icon: '🥇',
  },
  {
    name: 'Diamante',
    threshold: 5000,
    color: '#0EA5E9',
    icon: '💎',
  },
];

export interface ScoreOption {
  category: string;
  tier: 'alto' | 'medio' | 'baixo';
  points: number;
}

export const SCORE_TIERS: ScoreOption[] = [
  {
    category: 'Ábaco',
    tier: 'alto',
    points: 100,
  },
  {
    category: 'Abrindo Horizontes',
    tier: 'medio',
    points: 50,
  },
  {
    category: 'Desafio da Semana',
    tier: 'baixo',
    points: 5,
  },
  {
    category: 'Supera Online',
    tier: 'medio',
    points: 50,
  },
];
