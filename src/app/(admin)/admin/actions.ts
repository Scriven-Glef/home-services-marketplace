'use server'

import { supabase } from '@/lib/supabase';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function adminLogin(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const serverClient = await createClient()

  const { data, error } = await serverClient.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    return { error: error.message }
  }

  // Ensure this user actually has the admin role
  if (data.user) {
    const { data: userData } = await serverClient
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (!userData || userData.role !== 'admin') {
      await serverClient.auth.signOut()
      return { error: 'Unauthorized. This account does not have admin privileges.' }
    }
  }

  redirect('/admin')
}

export async function getPendingVendors() {
  const { data, error } = await supabase
    .from('vendor_profiles')
    .select(`
      id,
      business_name,
      document_urls,
      onboarding_status,
      users:user_id ( name, email, phone )
    `)
    .eq('onboarding_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching vendors:', error);
    return [];
  }
  return data;
}

export async function updateVendorStatus(vendorId: string, status: 'approved' | 'rejected') {
  const { error } = await supabase
    .from('vendor_profiles')
    .update({ onboarding_status: status })
    .eq('id', vendorId);

  if (error) {
    console.error('Error updating vendor status:', error);
    return { error: error.message };
  }
  
  revalidatePath('/admin/vendors');
  revalidatePath('/admin', 'layout');
  revalidatePath('/vendor');
  return { success: true };
}

export async function getMasterServices() {
  const { data, error } = await supabase
    .from('master_services')
    .select('*')
    .order('category')
    .order('name');

  if (error) {
    console.error('Error fetching master services:', error);
    return [];
  }
  return data;
}

export async function createMasterService(formData: FormData) {
  const category = formData.get('category') as string;
  const name = formData.get('name') as string;
  const description = formData.get('description') as string;

  const { error } = await supabase
    .from('master_services')
    .insert([{ category, name, description }]);

  if (error) {
    console.error('Error creating master service:', error);
    return { error: error.message };
  }

  revalidatePath('/services');
  return { success: true };
}

export async function deleteMasterService(id: string) {
  const { error } = await supabase
    .from('master_services')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting master service:', error);
    return { error: error.message };
  }

  revalidatePath('/admin/services');
  return { success: true };
}

// ----------------------------------------------------------------------------
// NEW DYNAMIC SERVICE CATALOG ACTIONS
// ----------------------------------------------------------------------------
export async function getServiceCatalog() {
  const serverClient = await createClient()
  const { data, error } = await serverClient
    .from('service_catalog')
    .select('*')
    .order('category')
    .order('problem_group')
    .order('service_name');

  if (error) {
    console.error('Error fetching service catalog:', error);
    return [];
  }
  return data;
}

export async function updateServiceStatus(id: string, is_active: boolean) {
  const serverClient = await createClient()
  const { error } = await serverClient
    .from('service_catalog')
    .update({ is_active })
    .eq('id', id);

  if (error) {
    console.error('Error updating service status:', error);
    return { error: error.message };
  }

  revalidatePath('/admin/services');
  return { success: true };
}

export async function updateServicePrice(id: string, base_price: number) {
  const serverClient = await createClient()
  const { error } = await serverClient
    .from('service_catalog')
    .update({ base_price })
    .eq('id', id);

  if (error) {
    console.error('Error updating service price:', error);
    return { error: error.message };
  }

  revalidatePath('/admin/services');
  return { success: true };
}

export async function getAllBookings() {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      order_number,
      scheduled_time,
      created_at,
      service_address,
      customer_phone,
      catalog_service_ids,
      final_quoted_price,
      quote_status,
      customer:users!bookings_customer_id_fkey(name),
      vendor:users!bookings_vendor_id_fkey(name)
    `)
    .in('status', ['pending', 'vendor_assigned', 'in_transit', 'completed'])
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('Error fetching bookings:', error);
    return [];
  }

  // Map services like the vendor dashboard
  const allCatalogIds = new Set<string>();
  data.forEach(b => {
    if (b.catalog_service_ids) {
      b.catalog_service_ids.forEach((id: string) => allCatalogIds.add(id));
    }
  });

  let catalogMap: Record<string, any> = {};
  if (allCatalogIds.size > 0) {
    const { data: catalogItems } = await supabase
      .from('service_catalog')
      .select('id, service_name, base_price, category')
      .in('id', Array.from(allCatalogIds));
      
    if (catalogItems) {
      catalogItems.forEach(item => {
        catalogMap[item.id] = item;
      });
    }
  }

  return data.map(b => {
    const services = (b.catalog_service_ids || []).map((id: string) => catalogMap[id]).filter(Boolean);
    return {
      ...b,
      services
    };
  });
}

export async function updateBookingStatus(bookingId: string, status: string) {
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId);

  if (error) {
    console.error('Error updating booking status:', error);
    return { error: error.message };
  }

  revalidatePath('/admin', 'layout');
  revalidatePath('/admin/bookings');
  revalidatePath('/bookings');
  revalidatePath('/vendor');
  return { success: true };
}

export async function updateBookingQuote(bookingId: string, quotePrice: number) {
  const { error } = await supabase
    .from('bookings')
    .update({ 
      final_quoted_price: quotePrice,
      quote_status: 'provided'
    })
    .eq('id', bookingId);

  if (error) {
    console.error('Error overriding booking quote:', error);
    return { error: error.message };
  }

  revalidatePath('/admin', 'layout');
  revalidatePath('/admin/bookings');
  revalidatePath('/bookings');
  revalidatePath('/vendor');
  return { success: true };
}

export async function createCatalogService(formData: FormData) {
  const category = formData.get('category') as string;
  const problem_group = formData.get('problem_group') as string;
  const service_name = formData.get('service_name') as string;
  const base_price = parseFloat(formData.get('base_price') as string || '0');

  const { error } = await supabase
    .from('service_catalog')
    .insert([{ category, problem_group, service_name, base_price, is_active: true }]);

  if (error) {
    console.error('Error creating catalog service:', error);
    return { error: error.message };
  }

  revalidatePath('/admin/services');
  return { success: true };
}
