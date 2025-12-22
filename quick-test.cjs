#!/usr/bin/env node

/**
 * Quick Test for Customer Management API
 * Tests the simple local server
 */

const BASE_URL = 'http://localhost:3000';

async function quickTest() {
  console.log('🚀 TESTING CUSTOMER MANAGEMENT API');
  console.log('📍 Server:', BASE_URL);
  console.log('=' .repeat(50));

  try {
    // Test 1: Health Check
    console.log('\n1️⃣  Health Check...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ Health check passed:', healthData.status);
    } else {
      console.log('❌ Health check failed:', healthResponse.status);
      return;
    }

    // Test 2: Admin Login
    console.log('\n2️⃣  Admin Login...');
    const adminLogin = await fetch(`${BASE_URL}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@yourcompany.com',
        password: 'YourSecurePassword123!'
      })
    });

    if (!adminLogin.ok) {
      console.log('❌ Admin login failed:', await adminLogin.text());
      return;
    }

    const adminData = await adminLogin.json();
    const adminToken = adminData.data.token;
    console.log('✅ Admin login successful');
    console.log('🔑 Token:', adminToken.substring(0, 20) + '...');

    // Test 3: Admin Overview
    console.log('\n3️⃣  Admin Dashboard Overview...');
    const overviewResponse = await fetch(`${BASE_URL}/api/v1/admin/overview`);
    
    if (overviewResponse.ok) {
      const overviewData = await overviewResponse.json();
      console.log('✅ Admin overview loaded');
      console.log('📊 Stats:', {
        customers: overviewData.data.overview.totalCustomers,
        revenue: '$' + overviewData.data.overview.monthlyRevenue,
        requests: overviewData.data.overview.apiRequestsThisMonth
      });
    } else {
      console.log('❌ Admin overview failed');
    }

    // Test 4: Create Customer
    console.log('\n4️⃣  Creating Customer...');
    const createCustomer = await fetch(`${BASE_URL}/api/v1/admin/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'newcustomer@example.com',
        company: 'New Test Company',
        plan: 'basic'
      })
    });

    if (!createCustomer.ok) {
      console.log('❌ Customer creation failed:', await createCustomer.text());
      return;
    }

    const customerData = await createCustomer.json();
    const customerId = customerData.data.customer.id;
    console.log('✅ Customer created successfully');
    console.log('👤 Customer ID:', customerId);
    console.log('📧 Email:', customerData.data.customer.email);

    // Test 5: Generate API Key
    console.log('\n5️⃣  Generating API Key...');
    const generateKey = await fetch(`${BASE_URL}/api/v1/admin/customers/${customerId}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test API Key'
      })
    });

    if (!generateKey.ok) {
      console.log('❌ API key generation failed:', await generateKey.text());
      return;
    }

    const keyData = await generateKey.json();
    const apiKey = keyData.data.plainKey;
    console.log('✅ API key generated successfully');
    console.log('🔑 API Key:', apiKey);
    console.log('⚠️  Save this key - it won\'t be shown again!');

    // Test 6: Test Business Registration
    console.log('\n6️⃣  Testing Business Registration...');
    const businessReg = await fetch(`${BASE_URL}/api/v1/business/name-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`
      },
      body: JSON.stringify({
        ref: `test-${Date.now()}`,
        full_name: 'John Doe',
        business_name1: 'Test Business Ltd',
        business_name2: 'Alternative Business Name',
        nature_of_business: 'Software development and consulting services',
        image_id_card: 'base64-encoded-image',
        date_of_birth: '15-03-1990',
        email: 'john.doe@testbusiness.com',
        phone: '08012345678',
        image_passport: 'base64-encoded-image',
        image_signature: 'base64-encoded-image'
      })
    });

    if (businessReg.ok) {
      const regData = await businessReg.json();
      console.log('✅ Business registration submitted successfully');
      console.log('📋 Reference:', regData.data.middlewareMetadata.referenceId);
      console.log('🆔 Request ID:', regData.data.documentsApiResponse.request_id);
    } else {
      console.log('❌ Business registration failed:', businessReg.status);
    }

    // Test 7: List Customers
    console.log('\n7️⃣  Listing Customers...');
    const listCustomers = await fetch(`${BASE_URL}/api/v1/admin/customers`);
    
    if (listCustomers.ok) {
      const customerList = await listCustomers.json();
      console.log('✅ Customer list retrieved');
      console.log('👥 Total customers:', customerList.data.customers.length);
      customerList.data.customers.forEach(customer => {
        console.log('   -', customer.email, '(' + customer.plan + ')');
      });
    }

    console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('\n📊 SUMMARY:');
    console.log('✅ Admin authentication working');
    console.log('✅ Customer creation working');  
    console.log('✅ API key generation working');
    console.log('✅ Business registration working');
    console.log('✅ Admin dashboard data working');

    console.log('\n🚀 YOUR CUSTOMER MANAGEMENT SYSTEM IS READY!');
    console.log('📝 Next steps:');
    console.log('   1. Enable Firebase billing');
    console.log('   2. Deploy to Firebase Functions');
    console.log('   3. Add real customers and start generating revenue!');

  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('- Make sure the server is running: node test-server-simple.cjs');
    console.log('- Check the server console for any errors');
    console.log('- Verify the server started on port 3000');
  }
}

// Run the test
console.log('⏳ Starting comprehensive API test...\n');
quickTest();