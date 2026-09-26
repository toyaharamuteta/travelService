import type { TravelLog } from '../types/travel';

export const mockTravels: TravelLog[] = [
  {
    id: '1',
    userId: 'user-123',
    title: '秋の京都 寺社めぐり',
    destination: '京都府京都市',
    startDate: '2025-11-10',
    endDate: '2025-11-12',
    totalCost: 45000,
    rating: 5,
    memo: '紅葉がすごく綺麗だった！清水寺のライトアップが幻想的。',
    imageUrls: [],
  },
  {
    id: '2',
    userId: 'user-123',
    title: '温泉まったり週末旅',
    destination: '神奈川県箱根町',
    startDate: '2026-02-14',
    endDate: '2026-02-15',
    totalCost: 32000,
    rating: 4,
    memo: '温泉で日頃の疲れを癒せた。',
    imageUrls: [],
  },
];