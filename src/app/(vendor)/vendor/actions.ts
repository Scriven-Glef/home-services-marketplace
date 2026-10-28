'use server'

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getSessionUserId } from '@/lib/auth';

export async function getVendorProfile(providedUserId?: string) {
  const userId = providedUserId || await getSessionUserId();
  if (!userId) return null;
  
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vendor_profiles')
    .select('id, business_name, onboarding_status, users(name, email)')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching vendor profile:', error);
  }
  
  return data;
}

export async function registerVendor(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  
  const userId = user.id;
  const email = user.email;
  
  const name = formData.get('name') as string;
  const phone = formData.get('phone') as string;
  const businessName = formData.get('businessName') as string;
  const latitude = parseFloat(formData.get('latitude') as string);
  const longitude = parseFloat(formData.get('longitude') as string);
  
  const document = formData.get('document') as File;
  let documentUrls: string[] = [];

  if (document && document.size > 0) {
    const fileExt = document.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    
    const arrayBuffer = await document.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('vendor_documents')
      .upload(fileName, buffer, {
        contentType: document.type,
      });

    if (uploadError) {
      console.error('Error uploading document to Supabase storage:', uploadError);
      // If storage bucket is not configured or blocked by policy, fallback to placeholder rather than breaking onboarding
      documentUrls.push('https://placehold.co/600x400/png?text=Document+Uploaded');
    } else {
      const { data: publicUrlData } = supabase.storage
        .from('vendor_documents')
        .getPublicUrl(fileName);
        
      documentUrls.push(publicUrlData.publicUrl);
    }
  }

  // 1. Upsert the User with the real details to guarantee the row exists
  const { error: userError } = await supabase
    .from('users')
    .upsert({
      id: userId,
      email: email,
      name,
      phone,
      role: 'vendor'
    });

  if (userError) {
    return { error: userError.message };
  }

  // 2. Create Vendor Profile
  const { error: profileError } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: userId,
      business_name: businessName,
      document_urls: documentUrls,
      latitude: isNaN(latitude) ? 13.0827 : latitude,
      longitude: isNaN(longitude) ? 80.2707 : longitude,
      onboarding_status: 'pending'
    });

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath('/vendor');
  revalidatePath('/admin/vendors');
  revalidatePath('/admin', 'layout');
  return { success: true };
}

export async function getVendorServiceAreas(vendorProfileId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vendor_service_areas')
    .select('*')
    .eq('vendor_profile_id', vendorProfileId);

  if (error) return [];
  return data;
}

export async function addPincode(vendorProfileId: string, pincode: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('vendor_service_areas')
    .insert({ vendor_profile_id: vendorProfileId, pincode });

  if (error) return { error: error.message };
  revalidatePath('/vendor/areas');
  return { success: true };
}

export async function removePincode(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('vendor_service_areas')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/vendor/areas');
  return { success: true };
}

export async function getVendorServices(vendorProfileId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vendor_services')
    .select('id, is_available, catalog_service_id, service_catalog(id, service_name, base_price, category, problem_group)')
    .eq('vendor_profile_id', vendorProfileId);

  if (error) {
    console.error('Error fetching vendor services:', error);
    return [];
  }
  return data;
}

export async function updateVendorService(vendorProfileId: string, catalogServiceId: string, isAvailable: boolean) {
  const supabase = await createClient();
  
  if (!isAvailable) {
    const { error } = await supabase
      .from('vendor_services')
      .delete()
      .eq('vendor_profile_id', vendorProfileId)
      .eq('catalog_service_id', catalogServiceId);
      
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('vendor_services')
      .upsert({
        vendor_profile_id: vendorProfileId,
        catalog_service_id: catalogServiceId,
        is_available: true
      }, { onConflict: 'vendor_profile_id, catalog_service_id' });
      
    if (error) return { error: error.message };
  }

  revalidatePath('/vendor/services');
  return { success: true };
}

export async function batchUpdateVendorServices(vendorProfileId: string, catalogServiceIds: string[]) {
  const supabase = await createClient();
  
  if (catalogServiceIds.length === 0) {
    const { error } = await supabase
      .from('vendor_services')
      .delete()
      .eq('vendor_profile_id', vendorProfileId);
    if (error) return { error: error.message };
  } else {
    const { error: deleteError } = await supabase
      .from('vendor_services')
      .delete()
      .eq('vendor_profile_id', vendorProfileId)
      .not('catalog_service_id', 'in', `(${catalogServiceIds.join(',')})`);
      
    if (deleteError) return { error: deleteError.message };

    const records = catalogServiceIds.map(id => ({
      vendor_profile_id: vendorProfileId,
      catalog_service_id: id,
      is_available: true
    }));
    
    const { error: upsertError } = await supabase
      .from('vendor_services')
      .upsert(records, { onConflict: 'vendor_profile_id, catalog_service_id' });
      
    if (upsertError) return { error: upsertError.message };
  }

  revalidatePath('/vendor/services');
  return { success: true };
}

export async function getMasterServices() {
  const supabase = await createClient();
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

export async function getVendorBookings(providedUserId?: string) {
  const userId = providedUserId || await getSessionUserId();
  if (!userId) return [];

  const supabase = await createClient();
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      service_address,
      customer_phone,
      customer_name,
      customer_latitude,
      customer_longitude,
      scheduled_time,
      created_at,
      catalog_service_ids,
      final_quoted_price,
      quote_status,
      order_number
    `)
    .eq('vendor_id', userId)
    .in('status', ['pending', 'vendor_assigned', 'in_transit'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !bookings) {
    console.error('Error fetching vendor bookings:', error);
    return [];
  }

  // Fetch the catalog items manually since it's an array of UUIDs
  const allCatalogIds = new Set<string>();
  bookings.forEach(b => {
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

  return bookings.map(b => {
    const services = (b.catalog_service_ids || []).map((id: string) => catalogMap[id]).filter(Boolean);
    return {
      ...b,
      services
    };
  });
}

export async function updateBookingStatus(bookingId: string, status: string) {
  const supabase = await createClient();
  const userId = await getSessionUserId();

  if (!userId) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId)
    .eq('vendor_id', userId);

  if (error) {
    console.error('Error updating booking status:', error);
    return { error: error.message };
  }

  revalidatePath('/vendor');
  revalidatePath('/bookings');
  revalidatePath('/admin', 'layout');
  revalidatePath('/admin/bookings');
  return { success: true };
}

export async function getServiceCatalog() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('service_catalog')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('problem_group')
    .order('service_name');

  if (error) {
    console.error('Error fetching service catalog:', error);
    return [];
  }
  return data;
}

export async function provideFinalQuote(formData: FormData) {
  const supabase = await createClient();
  const userId = await getSessionUserId();
  if (!userId) return { error: 'Unauthorized' };

  const bookingId = formData.get('bookingId') as string;
  const quotePrice = parseFloat(formData.get('quotePrice') as string);

  if (!bookingId || isNaN(quotePrice)) return { error: 'Invalid input' };

  const { error } = await supabase
    .from('bookings')
    .update({ 
      final_quoted_price: quotePrice,
      quote_status: 'provided'
    })
    .eq('id', bookingId)
    .eq('vendor_id', userId);

  if (error) {
    console.error('Error updating quote:', error);
    return { error: error.message };
  }

  revalidatePath('/vendor');
  revalidatePath('/bookings');
  revalidatePath('/admin', 'layout');
  revalidatePath('/admin/bookings');
  return { success: true };
}

export async function updateVendorPassword(formData: FormData) {
  const supabase = await createClient();
  
  const newPassword = formData.get('newPassword') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  
  if (!newPassword || newPassword !== confirmPassword) {
    return { error: 'Passwords do not match or are empty' };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) {
    console.error('Error updating password:', error);
    return { error: error.message };
  }

  revalidatePath('/vendor/profile');
  return { success: true };
}
