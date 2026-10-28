export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getPendingVendors } from "../actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VendorActions } from "./VendorActions";
import { StatusBadge } from "@/components/StatusBadge";
import { FileText } from "lucide-react";
import Link from "next/link";
import { AutoRefresher } from "@/components/AutoRefresher";

export default async function VendorsPage() {
  const vendors = await getPendingVendors();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Vendor Approval Queue</h2>
          <p className="text-slate-500 mt-2">
            Review and approve new vendors looking to join the platform.
          </p>
        </div>
        <AutoRefresher intervalSeconds={8} label="Live Queue" />
      </div>

      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="w-[250px]">Business Name</TableHead>
              <TableHead>Contact Info</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Documents</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                  No pending vendors found in the queue.
                </TableCell>
              </TableRow>
            ) : (
              vendors.map((vendor: any) => (
                <TableRow key={vendor.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium">{vendor.business_name}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p className="font-medium text-slate-900">{vendor.users?.name || 'N/A'}</p>
                      <p className="text-slate-500">{vendor.users?.email || 'N/A'}</p>
                      <p className="text-slate-500">{vendor.users?.phone || 'N/A'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={vendor.onboarding_status} />
                  </TableCell>
                  <TableCell>
                    <Link href="#" className="inline-flex items-center text-indigo-600 hover:text-indigo-800 hover:underline text-sm font-medium">
                      <FileText size={16} className="mr-1.5" /> View Docs
                    </Link>
                  </TableCell>
                  <TableCell>
                    <VendorActions vendorId={vendor.id} />
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
