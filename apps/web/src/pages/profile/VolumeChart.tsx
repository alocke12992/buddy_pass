import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const config = {
  volume: { label: 'Volume', color: 'var(--chart-1)' }, // volt-dim: you, on large fills
} satisfies ChartConfig;

/** Lazy-loaded (recharts stays out of the main bundle). Values arrive pre-converted to display units. */
export default function VolumeChart({ data }: { data: { label: string; volume: number }[] }) {
  return (
    <ChartContainer config={config} className="h-48 w-full">
      <BarChart data={data} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tickMargin={6} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="volume" fill="var(--color-volume)" radius={6} />
      </BarChart>
    </ChartContainer>
  );
}
