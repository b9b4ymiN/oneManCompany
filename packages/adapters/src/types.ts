import { z } from 'zod';

export const DCFResultSchema = z.object({
  fair_value_conservative: z.number(),
  fair_value_base: z.number(),
  fair_value_optimistic: z.number(),
});
export type DCFResult = z.infer<typeof DCFResultSchema>;

export const ReverseDCFResultSchema = z.object({
  implied_growth_rate: z.number(),
});
export type ReverseDCFResult = z.infer<typeof ReverseDCFResultSchema>;

export const MOSTableSchema = z.object({
  mos_10: z.number(),
  mos_20: z.number(),
  mos_30: z.number(),
  mos_40: z.number(),
});
export type MOSTable = z.infer<typeof MOSTableSchema>;

export const SensitivityMatrixSchema = z.object({
  rows: z.array(
    z.object({
      wacc: z.number(),
      terminal_growth: z.number(),
      fair_value: z.number(),
    })
  ),
});
export type SensitivityMatrix = z.infer<typeof SensitivityMatrixSchema>;

export const NormalizedEarningsResultSchema = z.object({
  normalized_earnings: z.number(),
  cashflow_quality_score: z.number(),
  stripped_items: z.array(z.object({ item: z.string(), amount: z.number() })),
});
export type NormalizedEarningsResult = z.infer<
  typeof NormalizedEarningsResultSchema
>;
