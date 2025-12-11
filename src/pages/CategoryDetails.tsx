import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

const CategoryDetails = () => {
  const { categoryName } = useParams();
  const category = categoryName || "";

  const { data: items, isLoading, error } = useQuery({
    queryKey: ["category-details", category],
    queryFn: async () => {
      // 1. Fetch Items
      const { data: receiptItems, error } = await supabase
        .from("receipt_items")
        .select(`
          *,
          receipts (
            store_name,
            receipt_date
          )
        `)
        .eq("category", category)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!receiptItems) return [];

      // 2. Fetch Verified Products to get sizes
      const productCodes = receiptItems
        .map((item) => item.product_code)
        .filter((code) => code !== null) as string[];

      // Deduplicate codes to avoid too many params
      const uniqueCodes = [...new Set(productCodes)];

      let verifiedMap: Record<string, string | null> = {};

      if (uniqueCodes.length > 0) {
        const { data: verifiedProducts, error: verifiedError } = await supabase
          .from("verified_products")
          .select("sku, size")
          .in("sku", uniqueCodes);

        if (!verifiedError && verifiedProducts) {
          verifiedProducts.forEach((vp) => {
            if (vp.size) {
              verifiedMap[vp.sku] = vp.size;
            }
          });
        }
      }

      // 3. Merge data
      return receiptItems.map((item) => ({
        ...item,
        verified_size: item.product_code ? verifiedMap[item.product_code] : null,
      }));
    },
    enabled: !!category,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <Header />
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="text-destructive mb-4">Failed to load category details</p>
          <Link to="/analytics">
            <Button variant="outline">Back to Analytics</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Calculate total quantity using the same logic as Analytics charts
  const totalQuantity = items?.reduce((sum, item) => {
    const qty = Number(item.quantity) || 1;
    return sum + (Number.isInteger(qty) ? qty : 1);
  }, 0) || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/analytics">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{category}</h1>
            <p className="text-muted-foreground">
              {totalQuantity} items found
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Item List</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Qty</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Total Price</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Store</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items?.map((item) => {
                  const rawQty = Number(item.quantity) || 1;
                  const isDecimal = !Number.isInteger(rawQty);
                  const displayQty = isDecimal ? 1 : rawQty;
                  
                  // Logic for "Size" column:
                  // 1. If it's a decimal quantity, it represents a weight.
                  //    Since we don't store the unit, we assume 'kg' for Canadian context.
                  //    This ensures "0.32" becomes "0.32 kg".
                  // 2. If it's an integer, we look for the static Verified Product size (e.g. "540 ml").
                  // 3. Fallback to "-"
                  
                  let displaySize = item.verified_size;
                  
                  if (isDecimal) {
                    displaySize = `${rawQty} kg`;
                  } else if (!displaySize) {
                    displaySize = "-";
                  }

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-muted-foreground">
                        {displayQty}
                      </TableCell>
                      <TableCell>{item.brand || "-"}</TableCell>
                      <TableCell className="font-medium">{item.item_name}</TableCell>
                      <TableCell>
                        {displaySize !== "-" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                            {displaySize}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">${item.total_price.toFixed(2)}</TableCell>
                      <TableCell>
                        {item.receipts?.receipt_date
                          ? format(new Date(item.receipts.receipt_date), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>{item.receipts?.store_name || "Unknown Store"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CategoryDetails;
