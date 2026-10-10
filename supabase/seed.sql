-- =============================================================================
-- Campus Table — SAMPLE MENU DATA (development only)
--
-- Every row here is a clearly identified sample: all ids start with
-- '5eed0000-'. Replace them from Admin → Menu, or remove them all with:
--
--   delete from public.menu_item_options where id::text like '5eed0000-%';
--   delete from public.menu_items        where id::text like '5eed0000-%';
--   delete from public.categories        where id::text like '5eed0000-%';
--
-- Deleting an item that has already been ordered is safe: order_items keep a
-- snapshot of the name and price and their menu_item_id becomes NULL. Archiving
-- (Admin → Menu → "Listed" off) is still preferred for items you may bring back.
--
-- Photos are hotlinked from Unsplash (https://unsplash.com/license) for
-- development. Items without a photo use the designed placeholder tile.
-- Replace both with photography of your own food via Admin → Menu.
--
-- This file contains no credentials and creates no users or roles.
-- It is idempotent: re-running it does not duplicate rows.
-- =============================================================================

insert into public.categories (id, name, slug, description, sort_order) values
  ('5eed0000-0000-4000-a000-000000000001', 'Breakfast', 'breakfast', 'Served from opening until 11:30.', 10),
  ('5eed0000-0000-4000-a000-000000000002', 'Meals', 'meals', 'Hearty plates for lunch and dinner.', 20),
  ('5eed0000-0000-4000-a000-000000000003', 'Snacks', 'snacks', 'Quick bites between lectures.', 30),
  ('5eed0000-0000-4000-a000-000000000004', 'Beverages', 'beverages', 'Hot and cold drinks.', 40),
  ('5eed0000-0000-4000-a000-000000000005', 'Specials', 'specials', 'Rotating favourites from the kitchen.', 50)
on conflict (id) do nothing;

insert into public.menu_items
  (id, category_id, name, description, price_paise, image_url, is_vegetarian, is_featured, sort_order)
values
  -- Breakfast
  ('5eed0000-0000-4000-b000-000000000101', '5eed0000-0000-4000-a000-000000000001',
   'Masala Dosa', 'Crisp rice crêpe filled with spiced potato, served with coconut chutney and sambar.',
   7000, null, true, true, 10),
  ('5eed0000-0000-4000-b000-000000000102', '5eed0000-0000-4000-a000-000000000001',
   'Idli Sambar', 'Three steamed rice cakes with sambar and fresh coconut chutney.',
   5000, null, true, false, 20),
  ('5eed0000-0000-4000-b000-000000000103', '5eed0000-0000-4000-a000-000000000001',
   'Kanda Poha', 'Flattened rice tempered with onion, peanuts, curry leaves and a squeeze of lime.',
   4000, null, true, false, 30),
  ('5eed0000-0000-4000-b000-000000000104', '5eed0000-0000-4000-a000-000000000001',
   'Aloo Paratha', 'Whole-wheat flatbread stuffed with spiced potato, with curd and pickle.',
   6000, null, true, false, 40),
  ('5eed0000-0000-4000-b000-000000000105', '5eed0000-0000-4000-a000-000000000001',
   'Masala Omelette & Toast', 'Two-egg omelette with onion, tomato and green chilli, with buttered toast.',
   5500, 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=75',
   false, false, 50),

  -- Meals
  ('5eed0000-0000-4000-b000-000000000201', '5eed0000-0000-4000-a000-000000000002',
   'Veg Thali', 'Two sabzis, dal, rice, two rotis, salad and a sweet of the day.',
   11000, null, true, true, 10),
  ('5eed0000-0000-4000-b000-000000000202', '5eed0000-0000-4000-a000-000000000002',
   'Paneer Butter Masala & Roti', 'Cottage cheese in a rich tomato-butter gravy, with two tandoori rotis.',
   12000, null, true, false, 20),
  ('5eed0000-0000-4000-b000-000000000203', '5eed0000-0000-4000-a000-000000000002',
   'Rajma Chawal', 'Slow-cooked kidney bean curry with steamed basmati rice.',
   8000, null, true, false, 30),
  ('5eed0000-0000-4000-b000-000000000204', '5eed0000-0000-4000-a000-000000000002',
   'Chicken Biryani', 'Fragrant basmati layered with spiced chicken, served with raita.',
   14000, null, false, true, 40),

  -- Snacks
  ('5eed0000-0000-4000-b000-000000000301', '5eed0000-0000-4000-a000-000000000003',
   'Samosa (2 pcs)', 'Flaky pastry with spiced potato and peas, with mint and tamarind chutneys.',
   3000, null, true, false, 10),
  ('5eed0000-0000-4000-b000-000000000302', '5eed0000-0000-4000-a000-000000000003',
   'Vada Pav', 'Spiced potato fritter in a soft pav with garlic chutney.',
   2500, null, true, false, 20),
  ('5eed0000-0000-4000-b000-000000000303', '5eed0000-0000-4000-a000-000000000003',
   'Veg Grilled Sandwich', 'Grilled sandwich with vegetables, green chutney and a light spread of butter.',
   6000, 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=75',
   true, true, 30),
  ('5eed0000-0000-4000-b000-000000000304', '5eed0000-0000-4000-a000-000000000003',
   'French Fries', 'Golden, lightly salted fries with ketchup.',
   6000, 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=75',
   true, false, 40),
  ('5eed0000-0000-4000-b000-000000000305', '5eed0000-0000-4000-a000-000000000003',
   'Veg Burger', 'Crisp vegetable patty, lettuce, tomato and house sauce in a toasted bun.',
   7000, 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=75',
   true, false, 50),

  -- Beverages
  ('5eed0000-0000-4000-b000-000000000401', '5eed0000-0000-4000-a000-000000000004',
   'Masala Chai', 'Strong tea brewed with milk, ginger and cardamom.',
   1500, null, true, false, 10),
  ('5eed0000-0000-4000-b000-000000000402', '5eed0000-0000-4000-a000-000000000004',
   'Hot Coffee', 'Freshly brewed coffee with steamed milk.',
   2500, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=75',
   true, false, 20),
  ('5eed0000-0000-4000-b000-000000000403', '5eed0000-0000-4000-a000-000000000004',
   'Cold Coffee', 'Chilled blended coffee with milk.',
   5000, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=75',
   true, true, 30),
  ('5eed0000-0000-4000-b000-000000000404', '5eed0000-0000-4000-a000-000000000004',
   'Fresh Lime Soda', 'Freshly squeezed lime with soda — sweet or salted, ask at the counter.',
   3500, null, true, false, 40),
  ('5eed0000-0000-4000-b000-000000000405', '5eed0000-0000-4000-a000-000000000004',
   'Mango Lassi', 'Thick yoghurt drink blended with mango pulp.',
   4500, null, true, false, 50),

  -- Specials
  ('5eed0000-0000-4000-b000-000000000501', '5eed0000-0000-4000-a000-000000000005',
   'Chole Bhature', 'Spiced chickpea curry with two fluffy bhature, onion and pickle.',
   9000, null, true, false, 10),
  ('5eed0000-0000-4000-b000-000000000502', '5eed0000-0000-4000-a000-000000000005',
   'Pav Bhaji', 'Buttery mashed-vegetable bhaji with two toasted pavs.',
   8000, null, true, false, 20),
  ('5eed0000-0000-4000-b000-000000000503', '5eed0000-0000-4000-a000-000000000005',
   'Chocolate Brownie', 'Eggless dark-chocolate brownie, baked in-house.',
   5000, null, true, false, 30)
on conflict (id) do nothing;

-- A sample sold-out item, to demonstrate availability handling.
update public.menu_items set is_available = false
where id = '5eed0000-0000-4000-b000-000000000104' and is_available;

insert into public.menu_item_options (id, menu_item_id, name, price_delta_paise, sort_order) values
  ('5eed0000-0000-4000-8000-000000000001', '5eed0000-0000-4000-b000-000000000101', 'Extra chutney', 0, 10),
  ('5eed0000-0000-4000-8000-000000000002', '5eed0000-0000-4000-b000-000000000101', 'Butter roast', 1000, 20),
  ('5eed0000-0000-4000-8000-000000000003', '5eed0000-0000-4000-b000-000000000204', 'Extra raita', 1500, 10),
  ('5eed0000-0000-4000-8000-000000000004', '5eed0000-0000-4000-b000-000000000204', 'Boiled egg', 1500, 20),
  ('5eed0000-0000-4000-8000-000000000005', '5eed0000-0000-4000-b000-000000000303', 'Add cheese', 1500, 10),
  ('5eed0000-0000-4000-8000-000000000006', '5eed0000-0000-4000-b000-000000000304', 'Peri-peri seasoning', 1000, 10),
  ('5eed0000-0000-4000-8000-000000000007', '5eed0000-0000-4000-b000-000000000305', 'Add cheese slice', 1500, 10),
  ('5eed0000-0000-4000-8000-000000000008', '5eed0000-0000-4000-b000-000000000401', 'Less sugar', 0, 10),
  ('5eed0000-0000-4000-8000-000000000009', '5eed0000-0000-4000-b000-000000000403', 'Add a scoop of ice cream', 2000, 10),
  ('5eed0000-0000-4000-8000-000000000010', '5eed0000-0000-4000-b000-000000000502', 'Extra pav', 1500, 10)
on conflict (id) do nothing;
