import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

interface CategoryData {
  category: string;
  total: number;
  count: number;
  color: string;
}

interface CategoryBarChartProps {
  data: CategoryData[];
}

export const CategoryBarChart = ({ data }: CategoryBarChartProps) => {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold text-foreground">{item.category}</p>
          <p className="text-sm text-muted-foreground">
            Total: ${item.total.toFixed(2)}
          </p>
          <p className="text-sm text-muted-foreground">{item.count} items</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="bg-gradient-to-br from-card to-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Category Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No spending data available
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.slice(0, 8)}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => `$${value}`}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  width={70}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {data.slice(0, 8).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
