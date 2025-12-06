import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { subMonths, startOfMonth } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useSpendingAnalytics, DateRange } from "@/hooks/useSpendingAnalytics";
import { Header } from "@/components/Header";
import { AnalyticsSummary } from "@/components/analytics/AnalyticsSummary";
import { CategoryPieChart } from "@/components/analytics/CategoryPieChart";
import { MonthlyTrendChart } from "@/components/analytics/MonthlyTrendChart";
import { CategoryBarChart } from "@/components/analytics/CategoryBarChart";
import { CategoryTable } from "@/components/analytics/CategoryTable";
import { DateRangeFilter } from "@/components/analytics/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";

const Analytics = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 5)),
    to: new Date(),
  });

  const { data, isLoading, error, refetch } = useSpendingAnalytics(dateRange);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <Header />
        <div className="container mx-auto px-4 py-12">
          <div className="text-center">
            <p className="text-destructive mb-4">Failed to load analytics</p>
            <Button onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />

      <div className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Spending Analytics</h1>
              <p className="text-muted-foreground">
                Track your expenses by category and time
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-8">
          <AnalyticsSummary
            totalSpent={data?.totalSpent || 0}
            averagePerReceipt={data?.averagePerReceipt || 0}
            receiptCount={data?.receiptCount || 0}
            topCategory={data?.topCategory || "None"}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <CategoryPieChart data={data?.categoryBreakdown || []} />
          <MonthlyTrendChart data={data?.monthlyTrends || []} />
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <CategoryBarChart data={data?.categoryBreakdown || []} />
          <CategoryTable data={data?.categoryBreakdown || []} />
        </div>
      </div>
    </div>
  );
};

export default Analytics;