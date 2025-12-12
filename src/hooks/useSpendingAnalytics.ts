import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface CategorySpending {
  category: string;
  total: number;
  count: number;
  color: string;
}

interface MonthlySpending {
  month: string;
  total: number;
  categories: Record<string, number>;
}

interface SpendingAnalytics {
  categoryBreakdown: CategorySpending[];
  monthlyTrends: MonthlySpending[];
  totalSpent: number;
  averagePerReceipt: number;
  receiptCount: number;
  topCategory: string;
  topStore: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

const CATEGORY_COLORS: Record<string, string> = {
  Produce: "hsl(142, 71%, 45%)",
  Dairy: "hsl(197, 71%, 73%)",
  Meats: "hsl(0, 84%, 60%)",
  Bakery: "hsl(38, 92%, 50%)",
  Beverages: "hsl(280, 89%, 60%)",
  Frozen: "hsl(200, 80%, 50%)",
  Pantry: "hsl(25, 95%, 53%)",
  Household: "hsl(270, 60%, 50%)",
  Deli: "hsl(340, 80%, 55%)",
  Dips: "hsl(160, 60%, 45%)",
  Coffee: "hsl(30, 60%, 35%)",
  Dessert: "hsl(330, 70%, 65%)",
  Other: "hsl(220, 13%, 50%)",
};

export const useSpendingAnalytics = (dateRange?: DateRange) => {
  const { user } = useAuth();

  // Default to All Time (1970 to 2099) to ensure we capture all receipts regardless of date
  const defaultFrom = new Date(0);
  const defaultTo = new Date("2099-12-31");
  const fromDate = dateRange?.from || defaultFrom;
  const toDate = dateRange?.to || defaultTo;

  return useQuery<SpendingAnalytics>({
    queryKey: ["spending-analytics", user?.id, format(fromDate, "yyyy-MM-dd"), format(toDate, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!user) throw new Error("User not authenticated");

      const fromStr = format(fromDate, "yyyy-MM-dd");
      const toStr = format(toDate, "yyyy-MM-dd");

      // Fetch all receipt items with their categories within date range
      const { data: items, error: itemsError } = await supabase
        .from("receipt_items")
        .select(`
          id,
          total_price,
          quantity,
          category,
          created_at,
          receipt_id,
          receipts!inner(user_id, receipt_date)
        `)
        .eq("receipts.user_id", user.id)
        .gte("receipts.receipt_date", fromStr)
        .lte("receipts.receipt_date", toStr);

      if (itemsError) throw itemsError;

      // Fetch receipts for totals within date range
      const { data: receipts, error: receiptsError } = await supabase
        .from("receipts")
        .select("id, total_amount, receipt_date, store_name")
        .eq("user_id", user.id)
        .gte("receipt_date", fromStr)
        .lte("receipt_date", toStr);

      if (receiptsError) throw receiptsError;

      // Calculate category breakdown
      const categoryTotals: Record<string, { total: number; count: number }> = {};
      
      (items || []).forEach((item) => {
        const category = item.category || "Other";
        if (!categoryTotals[category]) {
          categoryTotals[category] = { total: 0, count: 0 };
        }
        categoryTotals[category].total += Number(item.total_price) || 0;
        
        const qty = Number(item.quantity) || 1;
        categoryTotals[category].count += Number.isInteger(qty) ? qty : 1;
      });

      const categoryBreakdown: CategorySpending[] = Object.entries(categoryTotals)
        .map(([category, data]) => ({
          category,
          total: Math.round(data.total * 100) / 100,
          count: data.count,
          color: CATEGORY_COLORS[category] || CATEGORY_COLORS.Other,
        }))
        .sort((a, b) => b.total - a.total);

      // Calculate monthly trends based on date range
      const monthlyData: Record<string, { total: number; categories: Record<string, number> }> = {};
      
      const isWideRange = (toDate.getFullYear() - fromDate.getFullYear()) > 2;

      if (!isWideRange) {
        let currentDate = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
        while (currentDate <= toDate) {
          const monthKey = currentDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
          monthlyData[monthKey] = { total: 0, categories: {} };
          currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        }
      }

      (items || []).forEach((item) => {
        const receiptData = item.receipts as unknown as { receipt_date: string };
        const receiptDate = new Date(receiptData.receipt_date);
        const monthKey = receiptDate.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        
        if (!monthlyData[monthKey]) {
           monthlyData[monthKey] = { total: 0, categories: {} };
        }

        const category = item.category || "Other";
        monthlyData[monthKey].total += Number(item.total_price) || 0;
        monthlyData[monthKey].categories[category] = 
          (monthlyData[monthKey].categories[category] || 0) + (Number(item.total_price) || 0);
      });

      const monthlyTrends: MonthlySpending[] = Object.entries(monthlyData)
        .map(([month, data]) => ({
          month,
          total: Math.round(data.total * 100) / 100,
          categories: Object.fromEntries(
            Object.entries(data.categories).map(([k, v]) => [k, Math.round(v * 100) / 100])
          ),
          _sortDate: new Date(Date.parse(`01 ${month}`)).getTime()
        }))
        .sort((a, b) => a._sortDate - b._sortDate)
        .map(({ _sortDate, ...rest }) => rest);

      // Calculate summary stats
      const totalSpent = (receipts || []).reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
      const receiptCount = (receipts || []).length;
      const averagePerReceipt = receiptCount > 0 ? totalSpent / receiptCount : 0;
      const topCategory = categoryBreakdown[0]?.category || "None";
      
      // Calculate Top Store
      const storeCounts: Record<string, number> = {};
      (receipts || []).forEach(r => {
          const store = r.store_name || "Unknown";
          storeCounts[store] = (storeCounts[store] || 0) + 1;
      });
      const topStore = Object.entries(storeCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || "None";

      return {
        categoryBreakdown,
        monthlyTrends,
        totalSpent: Math.round(totalSpent * 100) / 100,
        averagePerReceipt: Math.round(averagePerReceipt * 100) / 100,
        receiptCount,
        topCategory,
        topStore,
      };
    },
    enabled: !!user,
  });
};
