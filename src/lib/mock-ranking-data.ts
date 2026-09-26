// src/lib/mock-ranking-data.ts

export interface Category {
  id: string;
  name: 'Ábaco' | 'Abrindo Horizontes' | 'Desafio' | 'Supera Online';
  color: string;
}

export interface StudentRanking {
  id: string;
  name: string;
  avatarUrl?: string;
  classGroup: string;
  weeklyPoints: {
    Mon?: { categoryId: string; points: number }[];
    Tue?: { categoryId: string; points: number }[];
    Wed?: { categoryId: string; points: number }[];
    Thu?: { categoryId: string; points: number }[];
    Fri?: { categoryId: string; points: number }[];
    Sat?: { categoryId: string; points: number }[];
    Sun?: { categoryId: string; points: number }[];
  };
}

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'abaco', name: 'Ábaco', color: '#10B981' },
  { id: 'horizontes', name: 'Abrindo Horizontes', color: '#3B82F6' },
  { id: 'desafio', name: 'Desafio', color: '#F59E0B' },
  { id: 'supera', name: 'Supera Online', color: '#EF4444' },
];

export const MOCK_STUDENTS: StudentRanking[] = [
  {
    id: '1',
    name: 'Ana Silva',
    classGroup: 'Turma A',
    avatarUrl: '/avatars/ana.webp',
    weeklyPoints: {
      Mon: [{ categoryId: 'abaco', points: 15 }],
      Tue: [{ categoryId: 'horizontes', points: 20 }],
      Wed: [{ categoryId: 'desafio', points: 10 }],
      Thu: [{ categoryId: 'supera', points: 25 }],
    },
  },
  // Adicione outros alunos aqui
];
