import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp } from "lucide-react";

export const SpendingChart = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const spending = [425, 398, 456, 489, 434, 487];
  const maxSpending = Math.max(...spending);

  return (
    <Card className="bg-gradient-to-br from-card to-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Monthly Spending Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-end h-48 gap-2">
            {months.map((month, index) => {
              const height = (spending[index] / maxSpending) * 100;
              return (
                <div key={month} className="flex flex-col items-center gap-2 flex-1">
                  <div className="text-xs text-muted-foreground font-medium">
                    ${spending[index]}
                  </div>
                  <div 
                    className="w-full bg-gradient-to-t from-primary to-primary-glow rounded-t-md min-h-[20px] transition-all duration-700 ease-out"
                    style={{ height: `${height}%` }}
                  />
                  <div className="text-xs text-muted-foreground">
                    {month}
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-success">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">12.3% increase this month</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Average: ${Math.round(spending.reduce((a, b) => a + b, 0) / spending.length)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};