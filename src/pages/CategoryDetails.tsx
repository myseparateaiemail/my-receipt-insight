import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Check } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const categoryOptions = [
  "Bakery", "Baking", "Baking Supplies", "Beverages", "Canned Goods", "Cleaning", "Coffee",
  "Condiments & Sauces", "Cosmetics & Pharmacy", "Dairy", "Deli", "Dessert",
  "Dips", "Entertainment", "Frozen", "Garden", "Health", "Household", 
  "International Foods", "Laundry", "Meats", "Natural Foods", "Pantry", 
  "Pasta & Grains", "Personal Care", "Produce", "Ready Made", 
  "Seafood", "Snacks", "Spices & Seasonings"
].sort();

const EditableCell = ({ value, onSave, className }: { value: string, onSave: (val: string) => void, className?: string }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  const handleSave = () => {
    if (tempValue !== value) {
      onSave(tempValue);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Input
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        autoFocus
        className={`h-8 ${className}`}
      />
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)} 
      className={`cursor-pointer hover:bg-muted/50 p-1 rounded -ml-1 border border-transparent hover:border-border transition-colors ${className}`}
      title="Click to edit"
    >
      {value}
    </div>
  );
};

const CategoryDetails = () => {
  const { categoryName } = useParams();
  const category = categoryName || "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const updateProduct = async (item: any, updates: { item_name?: string; category?: string }) => {
    try {
      // 1. Update receipt_items
      const { error: itemError } = await supabase
        .from("receipt_items")
        .update(updates)
        .eq("id", item.id);

      if (itemError) throw itemError;

      // 2. If SKU exists, update verified_products for future accuracy
      if (item.product_code && item.product_code.length >= 3) {
        const storeChain = item.receipts?.store_name?.includes("Superstore") 
          ? "Real Canadian Superstore" 
          : item.receipts?.store_name || "Unknown";

        const { data: existing } = await supabase
            .from("verified_products")
            .select("id")
            .eq("sku", item.product_code)
            .maybeSingle();

        const verifiedUpdates: any = {};
        if (updates.item_name) verifiedUpdates.product_name = updates.item_name;
        if (updates.category) verifiedUpdates.category = updates.category;
        verifiedUpdates.last_verified_at = new Date().toISOString();

        if (existing) {
             await supabase
            .from("verified_products")
            .update(verifiedUpdates)
            .eq("id", existing.id);
        } else {
             // Insert new
             await supabase
             .from("verified_products")
             .insert({
                 sku: item.product_code,
                 store_chain: storeChain,
                 product_name: updates.item_name || item.item_name,
                 category: updates.category || item.category,
                 verification_count: 1,
                 ...verifiedUpdates
             });
        }
      }

      toast({
        title: "Updated",
        description: "Product information updated successfully.",
      });

      // Refetch data
      queryClient.invalidateQueries({ queryKey: ["category-details"] });

    } catch (err: any) {
      console.error("Update failed:", err);
      toast({
        title: "Error",
        description: "Failed to update product.",
        variant: "destructive",
      });
    }
  };

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
                  <TableHead>Category</TableHead>
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
                      <TableCell className="font-medium">
                        <EditableCell 
                          value={item.item_name} 
                          onSave={(newName) => updateProduct(item, { item_name: newName })} 
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.category}
                          onValueChange={(newCategory) => updateProduct(item, { category: newCategory })}
                        >
                          <SelectTrigger className="h-8 w-[140px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categoryOptions.map((opt) => (
                              <SelectItem key={opt} value={opt} className="text-xs">
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
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
