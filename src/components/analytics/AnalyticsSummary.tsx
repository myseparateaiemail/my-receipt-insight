import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Receipt, TrendingUp, Tag } from "lucide-react";

interface AnalyticsSummaryProps {
  totalSpent: number;
  averagePerReceipt: number;
  receiptCount: number;
  topCategory: string;
}

export const AnalyticsSummary = ({
  totalSpent,
  averagePerReceipt,
  receiptCount,
  topCategory,
}: AnalyticsSummaryProps) => {
  const stats = [
    {
      title: "Total Spent",
      value: `$${totalSpent.toFixed(2)}`,
      icon: DollarSign,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Receipts Scanned",
      value: receiptCount.toString(),
      icon: Receipt,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: "Average per Receipt",
      value: `$${averagePerReceipt.toFixed(2)}`,
      icon: TrendingUp,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Top Category",
      value: topCategory,
      icon: Tag,
      color: "text-success",
      bgColor: "bg-success/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card
          key={stat.title}
          className="bg-gradient-to-br from-card to-muted/30 hover:shadow-md transition-shadow"
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-full ${stat.bgColor}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
