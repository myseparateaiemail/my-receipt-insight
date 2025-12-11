import { useState } from "react";
import { Check, X, Plus, Trash2, Eye, EyeOff, CheckCircle2, HelpCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ParsedReceiptData, OcrItem } from "@/types";

interface ReceiptReviewProps {
  receiptImage: string;
  rawOcrText: string;
  parsedData: ParsedReceiptData;
  onApprove: (finalData: ParsedReceiptData) => void;
  onReject: () => void;
  onCancel: () => void;
}

export const ReceiptReview = ({
  receiptImage,
  rawOcrText,
  parsedData,
  onApprove,
  onReject,
  onCancel
}: ReceiptReviewProps) => {
  const [showRawText, setShowRawText] = useState(false);
  const [editedData, setEditedData] = useState<ParsedReceiptData>(parsedData);

  const updateStoreInfo = (field: keyof ParsedReceiptData, value: string | number) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateItem = (index: number, field: string, value: string | number | boolean) => {
    setEditedData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const addItem = () => {
    setEditedData(prev => ({
      ...prev,
      items: [...prev.items, {
        item_name: "",
        quantity: 1,
        total_price: 0,
        unit_price: 0,
        line_number: prev.items.length + 1,
        size: "",
        brand: "",
        confidence: 'fallback' as const
      }]
    }));
  };

  const removeItem = (index: number) => {
    setEditedData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const getConfidenceBadge = (confidence?: string) => {
    switch (confidence) {
      case 'verified':
        return (
          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-300">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        );
      case 'ai_suggested':
        return (
          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-300">
            <HelpCircle className="h-3 w-3 mr-1" />
            AI Suggestion
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs bg-gray-500/10 text-gray-600 border-gray-300">
            Needs Review
          </Badge>
        );
    }
  };

  const categoryOptions = [
    "Bakery", "Baking Supplies", "Beverages", "Canned Goods", "Coffee",
    "Condiments & Sauces", "Cosmetics & Pharmacy", "Dairy", "Deli", "Dessert",
    "Dips", "Entertainment", "Frozen", "Garden", "Health", "Household", 
    "International Foods", "Meats", "Natural Foods", "Pantry", 
    "Pasta & Grains", "Personal Care", "Produce", "Ready Made", 
    "Seafood", "Snacks", "Spices & Seasonings"
  ].sort();

  // Count items by confidence (excluding discount-only pseudo items)
  const regularItems = editedData.items;
  const verifiedCount = regularItems.filter(i => i.confidence === 'verified').length;
  const aiCount = regularItems.filter(i => i.confidence === 'ai_suggested').length;
  const needsReviewCount = regularItems.filter(i => !i.confidence || i.confidence === 'fallback').length;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Review Receipt Data</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRawText(!showRawText)}
                >
                  {showRawText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showRawText ? "Hide" : "Show"} Raw Text
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Confidence Summary */}
            <div className="flex gap-4 mb-4 p-3 bg-muted/30 rounded-lg text-sm">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>{verifiedCount} verified</span>
              </div>
              <div className="flex items-center gap-1">
                <HelpCircle className="h-4 w-4 text-blue-600" />
                <span>{aiCount} AI suggestions</span>
              </div>
              {needsReviewCount > 0 && (
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span>{needsReviewCount} need review</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Receipt Image */}
              <div className="space-y-4">
                <h3 className="font-semibold">Original Receipt</h3>
                <img 
                  src={receiptImage} 
                  alt="Receipt to review" 
                  className="w-full max-w-sm mx-auto rounded-lg border shadow-sm"
                />
                
                {showRawText && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Raw OCR Text</h4>
                    <Textarea
                      value={rawOcrText}
                      readOnly
                      className="font-mono text-xs resize-none h-32 bg-muted"
                    />
                  </div>
                )}
              </div>

              {/* Parsed Data */}
              <div className="space-y-4">
                <h3 className="font-semibold">Extracted Data</h3>
                
                {/* Store Information */}
                <div className="space-y-3 p-4 bg-muted/20 rounded-lg">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    Store Information
                    <Badge variant="secondary">{editedData.items.length} items</Badge>
                  </h4>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label htmlFor="store_name" className="text-xs">Store Name</Label>
                      <Input
                        id="store_name"
                        value={editedData.store_name || ""}
                        onChange={(e) => updateStoreInfo("store_name", e.target.value)}
                        placeholder="Enter store name"
                        className="h-8"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="receipt_date" className="text-xs">Date</Label>
                        <Input
                          id="receipt_date"
                          value={editedData.receipt_date || ""}
                          onChange={(e) => updateStoreInfo("receipt_date", e.target.value)}
                          placeholder="DD/MM/YY"
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label htmlFor="card_last_four" className="text-xs">Card Last 4</Label>
                        <Input
                          id="card_last_four"
                          value={editedData.card_last_four || ""}
                          onChange={(e) => updateStoreInfo("card_last_four", e.target.value)}
                          placeholder="0073"
                          maxLength={4}
                          className="h-8"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label htmlFor="subtotal" className="text-xs">Subtotal</Label>
                        <Input
                          id="subtotal"
                          type="number"
                          step="0.01"
                          value={editedData.subtotal_amount || ""}
                          onChange={(e) => updateStoreInfo("subtotal_amount", parseFloat(e.target.value))}
                          placeholder="0.00"
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label htmlFor="tax" className="text-xs">Tax</Label>
                        <Input
                          id="tax"
                          type="number"
                          step="0.01"
                          value={editedData.tax_amount || ""}
                          onChange={(e) => updateStoreInfo("tax_amount", parseFloat(e.target.value))}
                          placeholder="0.00"
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label htmlFor="total" className="text-xs">Total</Label>
                        <Input
                          id="total"
                          type="number"
                          step="0.01"
                          value={editedData.total_amount || ""}
                          onChange={(e) => updateStoreInfo("total_amount", parseFloat(e.target.value))}
                          placeholder="0.00"
                          className="h-8"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="payment_method" className="text-xs">Payment Method</Label>
                      <Input
                        id="payment_method"
                        value={editedData.payment_method || ""}
                        onChange={(e) => updateStoreInfo("payment_method", e.target.value)}
                        placeholder="Payment method"
                        className="h-8"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Items - Inline Editable */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Items</h4>
                    <Button variant="outline" size="sm" onClick={addItem}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    Edit items below. Your corrections help improve future accuracy.
                  </p>
                  
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {editedData.items.map((item, index) => (
                      <div 
                        key={index} 
                        className={`p-3 rounded-lg border space-y-2 ${
                          item.confidence === 'verified' 
                            ? 'bg-green-50/50 border-green-200' 
                            : 'bg-muted/10'
                        }`}
                      >
                        {/* Row 1: Name, Confidence Badge, Delete button */}
                        <div className="flex gap-2 items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Label className="text-xs text-muted-foreground">Product Name</Label>
                              {getConfidenceBadge(item.confidence)}
                            </div>
                            <Input
                              value={item.item_name}
                              onChange={(e) => updateItem(index, "item_name", e.target.value)}
                              placeholder="Product name"
                              className="h-8 font-medium"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Row 2: SKU, Brand, Size, Category */}
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">SKU</Label>
                            <Input
                              value={item.product_code || ""}
                              onChange={(e) => updateItem(index, "product_code", e.target.value)}
                              placeholder="UPC/PLU"
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Brand</Label>
                            <Input
                              value={item.brand || ""}
                              onChange={(e) => updateItem(index, "brand", e.target.value)}
                              placeholder="Brand"
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Size</Label>
                            <Input
                              value={item.size || ""}
                              onChange={(e) => updateItem(index, "size", e.target.value)}
                              placeholder="e.g., 400 ml"
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Category</Label>
                            <select
                              value={item.category || ""}
                              onChange={(e) => updateItem(index, "category", e.target.value)}
                              className="w-full h-7 px-2 text-xs border border-input bg-background rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="">Select</option>
                              {categoryOptions.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Row 3: Qty, Unit Price, Discount, Total */}
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Qty</Label>
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              value={item.quantity}
                              onChange={(e) => {
                                const qty = parseFloat(e.target.value) || 0;
                                updateItem(index, "quantity", qty);
                                const discount = item.discount_amount || 0;
                                if (item.unit_price) {
                                  updateItem(index, "total_price", (qty * item.unit_price) - Math.abs(discount));
                                }
                              }}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Unit Price</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.unit_price || ""}
                              onChange={(e) => {
                                const unitPrice = parseFloat(e.target.value) || 0;
                                updateItem(index, "unit_price", unitPrice);
                                const discount = item.discount_amount || 0;
                                updateItem(index, "total_price", (item.quantity * unitPrice) - Math.abs(discount));
                              }}
                              placeholder="0.00"
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Discount</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.discount_amount || ""}
                              onChange={(e) => {
                                const discount = parseFloat(e.target.value) || 0;
                                updateItem(index, "discount_amount", discount);
                                if (item.unit_price) {
                                  updateItem(index, "total_price", (item.quantity * item.unit_price) - Math.abs(discount));
                                }
                              }}
                              placeholder=""
                              className="h-7 text-xs text-green-600"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Total</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.total_price}
                              onChange={(e) => updateItem(index, "total_price", parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="h-7 text-xs font-medium"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={onReject}>
                <X className="h-4 w-4" />
                Reject & Delete
              </Button>
              <Button onClick={() => onApprove(editedData)}>
                <Check className="h-4 w-4" />
                Approve & Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};
