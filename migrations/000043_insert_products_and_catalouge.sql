DO $$
DECLARE
    -- Pre-generate UUIDs for categories to maintain relationships
    v_cat_home_id UUID := gen_random_uuid();
    v_cat_reed_id UUID := gen_random_uuid();
    v_cat_gift_id UUID := gen_random_uuid();
    v_cat_acc_id UUID  := gen_random_uuid();
BEGIN
    -- ============================================================
    -- 1. INSERT CATEGORIES
    -- ============================================================
    
    -- Root Category
    INSERT INTO diffusers.product_categories 
        (category_id, name, parent_category_id, description, display_order)
    VALUES 
        (v_cat_home_id, 'Home Fragrance', NULL, 'Orika''s master collection of refined luxury scents, expertly crafted to elevate interior spaces with fragrances rooted in nature.', 1);

    -- Sub-Categories
    INSERT INTO diffusers.product_categories 
        (category_id, name, parent_category_id, description, display_order)
    VALUES 
        (v_cat_reed_id, 'Reed Diffusers', v_cat_home_id, 'Premium glass-vessel diffusers available in 500ml and 1000ml variants, featuring signature long-lasting aromas and high-quality aroma sticks.', 1),
        (v_cat_gift_id, 'Gift Sets', v_cat_home_id, 'Curated presentation boxes and multi-scent collections designed to offer the ultimate luxury gifting experience.', 2),
        (v_cat_acc_id, 'Accessories', v_cat_home_id, 'Essential additions to maintain the fragrance experience, including premium replacement aroma sticks and diffuser care items.', 3);


    -- ============================================================
    -- 2. INSERT PRODUCTS
    -- ============================================================
    
    INSERT INTO diffusers.products (
        sku, 
        name, 
        description, 
        category_id, 
        cost_price, 
        selling_price, 
        min_selling_price, 
        currency, 
        weight_grams, 
        reorder_level, 
        reorder_quantity, 
        custom_fields
    ) VALUES 
    -- 500ml Diffusers
    (
        'ORIKA-RD-ROUGE-500', 
        'Orika Rouge Reed Diffuser - 500ml', 
        'A refined luxury reed diffuser presented in an elegant pink-tinted glass bottle. Orika Rouge delivers a captivating and sophisticated fragrance, rooted in nature, designed to elevate any interior space. Includes premium aroma sticks.', 
        v_cat_reed_id, 
        25000.00, 65000.00, 55000.00, 'NGN', 1250, 5, 50, 
        '{"volume_ml": 500, "diffuser_type": "Reed", "fragrance_note": "Rouge"}'::jsonb
    ),
    (
        'ORIKA-RD-SOLEI-500', 
        'Solei Reed Diffuser - 500ml', 
        'Brighten your environment with Solei. Housed in a warm, orange-tinted glass bottle, this luxury diffuser radiates a vibrant, sun-inspired natural aroma. Includes premium aroma sticks.', 
        v_cat_reed_id, 
        25000.00, 65000.00, 55000.00, 'NGN', 1250, 5, 50, 
        '{"volume_ml": 500, "diffuser_type": "Reed", "fragrance_note": "Citrus/Warm"}'::jsonb
    ),
    (
        'ORIKA-RD-LEMON-500', 
        'Lemon Verbena Reed Diffuser - 500ml', 
        'Refresh your space with the crisp, citrus notes of Lemon Verbena. Encased in a deep green-tinted glass bottle, this diffuser offers a revitalizing and clean fragrance experience. Includes premium aroma sticks.', 
        v_cat_reed_id, 
        25000.00, 65000.00, 55000.00, 'NGN', 1250, 5, 50, 
        '{"volume_ml": 500, "diffuser_type": "Reed", "fragrance_note": "Citrus/Fresh"}'::jsonb
    ),
    (
        'ORIKA-RD-OCEAN-500', 
        'Ocean Mist Reed Diffuser - 500ml', 
        'Bring the calming essence of the sea indoors with Ocean Mist. Presented in a striking blue-tinted glass bottle, this luxury diffuser provides a fresh, aquatic, and grounding aroma. Includes premium aroma sticks.', 
        v_cat_reed_id, 
        25000.00, 65000.00, 55000.00, 'NGN', 1250, 5, 50, 
        '{"volume_ml": 500, "diffuser_type": "Reed", "fragrance_note": "Aquatic/Fresh"}'::jsonb
    ),
    (
        'ORIKA-RD-MIDOUD-500', 
        'Midnight Oud Reed Diffuser - 500ml', 
        'Experience deep, woody elegance with Midnight Oud. This rich, luxurious fragrance is contained in a sophisticated brown-tinted glass bottle, bringing warmth and depth to your home. Includes premium aroma sticks.', 
        v_cat_reed_id, 
        28000.00, 68000.00, 58000.00, 'NGN', 1250, 5, 50, 
        '{"volume_ml": 500, "diffuser_type": "Reed", "fragrance_note": "Woody/Oud"}'::jsonb
    ),
    (
        'ORIKA-RD-ARMOUR-500', 
        'Oud Armour Reed Diffuser - 500ml', 
        'Fortify your senses with the bold, protective scent of Oud Armour. Displayed in a sleek, grey-tinted glass bottle, this diffuser offers a complex, grounding fragrance rooted in refined luxury. Includes premium aroma sticks.', 
        v_cat_reed_id, 
        28000.00, 68000.00, 58000.00, 'NGN', 1250, 5, 50, 
        '{"volume_ml": 500, "diffuser_type": "Reed", "fragrance_note": "Woody/Oud"}'::jsonb
    ),
    
    -- 1000ml Variant
    (
        'ORIKA-RD-OCEAN-1000', 
        'Ocean Mist Reed Diffuser - 1000ml', 
        'A grand statement of refined luxury. The 1000ml Ocean Mist diffuser provides long-lasting, continuous fragrance in our signature fresh aquatic scent, housed in a magnificent blue glass vessel.', 
        v_cat_reed_id, 
        45000.00, 115000.00, 100000.00, 'NGN', 2400, 3, 25, 
        '{"volume_ml": 1000, "diffuser_type": "Reed", "fragrance_note": "Aquatic/Fresh"}'::jsonb
    ),

    -- Gift Sets
    (
        'ORIKA-GIFT-TRIO-01', 
        'Orika Refined Luxury Trio Gift Set', 
        'The ultimate luxury gifting experience. This premium presentation box features three of our signature 500ml reed diffusers: Midnight Oud, Solei, and Lemon Verbena. Accompanied by a dedicated box of high-quality aroma sticks.', 
        v_cat_gift_id, 
        65000.00, 165000.00, 150000.00, 'NGN', 4200, 2, 15, 
        '{"set_contents": ["Midnight Oud 500ml", "Solei 500ml", "Lemon Verbena 500ml"], "box_type": "Premium Presentation"}'::jsonb
    );

END $$;