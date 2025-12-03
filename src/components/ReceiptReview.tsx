import { useState } from "react";
import { Check, X, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface ParsedReceiptData {
  items: Array<{
    item_name: string;
    product_code?: string;
    quantity: number;
    total_price: number;
    unit_price: number;
    line_number?: number;
    category?: string;
    size?: string;
    brand?: string;
    description?: string;
  }>;
  store_name?: string;
  store_phone?: string;
  tax_amount?: number;
  payment_method?: string;
  receipt_date?: string;
  subtotal_amount?: number;
  total_amount?: number;
}

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

  const updateItem = (index: number, field: string, value: string | number) => {
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
        brand: ""
      }]
    }));
  };

  const removeItem = (index: number) => {
    setEditedData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const categoryOptions = [
    "Bakery", "Baking Supplies", "Beverages", "Canned Goods", 
    "Condiments & Sauces", "Cosmetics & Pharmacy", "Dairy", "Deli", 
    "Entertainment", "Frozen", "Garden", "Health", "Household", 
    "International Foods", "Meats", "Natural Foods", "Pantry", 
    "Pasta & Grains", "Personal Care", "Produce", "Ready Made", 
    "Seafood", "Snacks", "Spices & Seasonings"
  ];

  return (
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
                      <Label htmlFor="store_phone" className="text-xs">Phone</Label>
                      <Input
                        id="store_phone"
                        value={editedData.store_phone || ""}
                        onChange={(e) => updateStoreInfo("store_phone", e.target.value)}
                        placeholder="Phone number"
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
                
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {editedData.items.map((item, index) => (
                    <div key={index} className="p-3 bg-muted/10 rounded-lg border space-y-2">
                      {/* Row 1: Name and Delete button */}
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Product Name</Label>
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
                            placeholder="e.g., PC"
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

                      {/* Row 3: Qty, Unit Price, Total */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Qty</Label>
                          <Input
                            type="number"
                            step="1"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const qty = parseFloat(e.target.value) || 1;
                              updateItem(index, "quantity", qty);
                              // Auto-calculate total if unit price exists
                              if (item.unit_price) {
                                updateItem(index, "total_price", qty * item.unit_price);
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
                              // Auto-calculate total
                              updateItem(index, "total_price", item.quantity * unitPrice);
                            }}
                            placeholder="0.00"
                            className="h-7 text-xs"
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
  );
};
