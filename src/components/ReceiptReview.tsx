import { useState } from "react";
import { Check, X, Edit3, Eye, EyeOff } from "lucide-react";
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
    description?: string; // e.g. package size like 400 ml, 454 g
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
  const [editingItem, setEditingItem] = useState<number | null>(null);

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
        line_number: prev.items.length + 1
      }]
    }));
  };

  const removeItem = (index: number) => {
    setEditedData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

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

              {/* Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">Items</h4>
                  <Button variant="outline" size="sm" onClick={addItem}>
                    Add Item
                  </Button>
                </div>
                
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {editedData.items.map((item, index) => (
                    <div key={index} className="p-3 bg-muted/10 rounded border space-y-2">
                      {editingItem === index ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-2">
                            <div>
                              <Label className="text-xs">Item Name</Label>
                              <Input
                                value={item.item_name}
                                onChange={(e) => updateItem(index, "item_name", e.target.value)}
                                placeholder="Item name"
                                className="h-8"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">SKU/Product Code</Label>
                              <Input
                                value={item.product_code || ""}
                                onChange={(e) => updateItem(index, "product_code", e.target.value)}
                                placeholder="UPC/PLU code"
                                className="h-8"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Category</Label>
                              <select
                                value={item.category || ""}
                                onChange={(e) => updateItem(index, "category", e.target.value)}
                                className="w-full h-8 px-3 border border-input bg-background text-sm rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <option value="">Select category</option>
                                <option value="Bakery">Bakery</option>
                                <option value="Baking Supplies">Baking Supplies</option>
                                <option value="Beverages">Beverages</option>
                                <option value="Canned Goods">Canned Goods</option>
                                <option value="Condiments & Sauces">Condiments & Sauces</option>
                                <option value="Cosmetics & Pharmacy">Cosmetics & Pharmacy</option>
                                <option value="Dairy">Dairy</option>
                                <option value="Deli">Deli</option>
                                <option value="Frozen">Frozen</option>
                                <option value="Garden">Garden</option>
                                <option value="Health">Health</option>
                                <option value="Household">Household</option>
                                <option value="International Foods">International Foods</option>
                                <option value="Meats">Meats</option>
                                <option value="Natural Foods">Natural Foods</option>
                                <option value="Pantry">Pantry</option>
                                <option value="Pasta & Grains">Pasta & Grains</option>
                                <option value="Produce">Produce</option>
                                <option value="Ready Made">Ready Made</option>
                                <option value="Seafood">Seafood</option>
                                <option value="Snacks">Snacks</option>
                                <option value="Spices & Seasonings">Spices & Seasonings</option>
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Quantity</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value))}
                                  placeholder="Qty"
                                  className="h-8"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Total Price</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.total_price}
                                  onChange={(e) => updateItem(index, "total_price", parseFloat(e.target.value))}
                                  placeholder="Price"
                                  className="h-8"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingItem(null)}
                            >
                              <Check className="h-3 w-3" />
                              Save
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeItem(index)}
                            >
                              <X className="h-3 w-3" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{item.item_name}</div>
                            <div className="text-xs text-muted-foreground flex gap-2">
                              {item.product_code && (
                                <span>SKU: {item.product_code}</span>
                              )}
                              {item.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {item.category}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Qty: {item.quantity} × ${item.unit_price?.toFixed(2) || (item.total_price / item.quantity).toFixed(2)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">${item.total_price.toFixed(2)}</div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingItem(index)}
                            >
                              <Edit3 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
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