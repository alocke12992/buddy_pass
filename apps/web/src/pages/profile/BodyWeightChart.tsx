import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const config = {
  weight: { label: 'Weight', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** Lazy-loaded. Values arrive pre-converted to display units. */
export default function BodyWeightChart({ data }: { data: { label: string; weight: number }[] }) {
  return (
    <ChartContainer config={config} className="h-48 w-full">
      <LineChart data={data} margin={{ left: 4, right: 12 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tickMargin={6} />
        <YAxis
          width={36}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          domain={['auto', 'auto']}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="weight"
          stroke="var(--color-weight)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--color-weight)' }}
        />
      </LineChart>
    </ChartContainer>
  );
}
