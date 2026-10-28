export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getServiceCatalog, updateServiceStatus, updateServicePrice } from "../actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ServiceForm } from "./ServiceForm";

export default async function AdminServicesPage() {
  const catalog = await getServiceCatalog();

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Service Catalog</h2>
        <p className="text-slate-500 mt-2">
          Manage dynamic pricing, categorize problems, and control visibility for the frontend.
        </p>
      </div>
      
      <ServiceForm />

      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Problem Group</TableHead>
              <TableHead>Service Name</TableHead>
              <TableHead className="w-32">Base Price (₹)</TableHead>
              <TableHead className="w-24 text-center">Active</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalog.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                  No services found. Run the seed script to populate the catalog.
                </TableCell>
              </TableRow>
            ) : (
              catalog.map((service: any) => (
                <TableRow key={service.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-700">
                    <Badge variant="outline" className="bg-slate-50">{service.category}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-500">
                    {service.problem_group}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900">
                    {service.service_name}
                  </TableCell>
                  <TableCell>
                    <form action={async (formData) => {
                      "use server"
                      const price = parseFloat(formData.get("price") as string)
                      if (!isNaN(price)) {
                        await updateServicePrice(service.id, price)
                      }
                    }} className="flex items-center gap-2">
                      <Input 
                        name="price" 
                        type="number" 
                        defaultValue={service.base_price} 
                        className="h-8 w-20 text-right font-medium"
                      />
                      <Button type="submit" size="sm" variant="ghost" className="h-8 px-2 text-indigo-600">Save</Button>
                    </form>
                  </TableCell>
                  <TableCell className="text-center">
                    <form action={async () => {
                      "use server"
                      await updateServiceStatus(service.id, !service.is_active)
                    }}>
                      <Button 
                        type="submit" 
                        variant={service.is_active ? "default" : "secondary"} 
                        size="sm"
                        className={service.is_active ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                      >
                        {service.is_active ? "Active" : "Inactive"}
                      </Button>
                    </form>
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Placeholder for future edits (e.g. edit names, problem groups) */}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
