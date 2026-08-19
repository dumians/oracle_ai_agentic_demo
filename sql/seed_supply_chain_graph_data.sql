set define off

prompt [1/8] seed gc_suppliers
merge into gc_suppliers target
using (
    select 1001 as supplier_id, 'Vertex Plastics' as supplier_name, 1 as tier_level, 'Busan' as region_code, 92 as on_time_pct, 'Y' as active_flag from dual
    union all
    select 1002, 'Atlas Components', 1, 'Shenzhen', 96, 'Y' from dual
    union all
    select 1003, 'Meridian Metals', 1, 'Monterrey', 89, 'Y' from dual
) source
on (target.supplier_id = source.supplier_id)
when matched then update set
    target.supplier_name = source.supplier_name,
    target.tier_level = source.tier_level,
    target.region_code = source.region_code,
    target.on_time_pct = source.on_time_pct,
    target.active_flag = source.active_flag
when not matched then insert (
    supplier_id, supplier_name, tier_level, region_code, on_time_pct, active_flag
) values (
    source.supplier_id, source.supplier_name, source.tier_level, source.region_code, source.on_time_pct, source.active_flag
);

prompt [2/8] seed gc_plants
merge into gc_plants target
using (
    select 2001 as plant_id, 'Columbus Assembly' as plant_name, 4.5 as cycle_days, 88.5 as utilization_pct, 'Y' as active_flag from dual
    union all
    select 2002, 'Austin High-Tech Facility', 3.2, 94.0, 'Y' from dual
    union all
    select 2003, 'Raleigh Precision Plant', 5.1, 82.0, 'Y' from dual
) source
on (target.plant_id = source.plant_id)
when matched then update set
    target.plant_name = source.plant_name,
    target.cycle_days = source.cycle_days,
    target.utilization_pct = source.utilization_pct,
    target.active_flag = source.active_flag
when not matched then insert (
    plant_id, plant_name, cycle_days, utilization_pct, active_flag
) values (
    source.plant_id, source.plant_name, source.cycle_days, source.utilization_pct, source.active_flag
);

prompt [3/8] seed sc_ports
merge into sc_ports target
using (
    select 3001 as port_id, 'Houston Port' as port_name, 54 as eta_hours, 0.31 as delay_risk_score, 'Y' as active_flag from dual
    union all
    select 3002, 'Savannah Terminal', 26, 0.14, 'Y' from dual
    union all
    select 3003, 'Long Beach Gateway', 62, 0.41, 'Y' from dual
) source
on (target.port_id = source.port_id)
when matched then update set
    target.port_name = source.port_name,
    target.eta_hours = source.eta_hours,
    target.delay_risk_score = source.delay_risk_score,
    target.active_flag = source.active_flag
when not matched then insert (
    port_id, port_name, eta_hours, delay_risk_score, active_flag
) values (
    source.port_id, source.port_name, source.eta_hours, source.delay_risk_score, source.active_flag
);

prompt [4/8] seed sc_warehouses
merge into sc_warehouses target
using (
    select 4001 as warehouse_id, 'Newark Inventory Hub' as warehouse_name, 4226 as inventory_units, 95 as fill_rate_pct, 'Y' as active_flag from dual
    union all
    select 4002, 'DFW Logistics Hub', 3180, 97, 'Y' from dual
    union all
    select 4003, 'Chicago Crossdock Hub', 2875, 93, 'Y' from dual
) source
on (target.warehouse_id = source.warehouse_id)
when matched then update set
    target.warehouse_name = source.warehouse_name,
    target.inventory_units = source.inventory_units,
    target.fill_rate_pct = source.fill_rate_pct,
    target.active_flag = source.active_flag
when not matched then insert (
    warehouse_id, warehouse_name, inventory_units, fill_rate_pct, active_flag
) values (
    source.warehouse_id, source.warehouse_name, source.inventory_units, source.fill_rate_pct, source.active_flag
);

prompt [5/8] seed sc_products
merge into sc_products target
using (
    select 'SKU-500' as product_id, 'Sustainable High-Density Polymer 500' as product_name, 8.5 as demand_change_pct, 32.0 as margin_pct, 'Y' as active_flag from dual
    union all
    select 'SKU-700', 'Low Carbon Precision Component 700', -2.5, 26.5, 'Y' from dual
    union all
    select 'SKU-900', 'Circular IoT Environmental Sensor 900', 11.2, 22.0, 'Y' from dual
) source
on (target.product_id = source.product_id)
when matched then update set
    target.product_name = source.product_name,
    target.demand_change_pct = source.demand_change_pct,
    target.margin_pct = source.margin_pct,
    target.active_flag = source.active_flag
when not matched then insert (
    product_id, product_name, demand_change_pct, margin_pct, active_flag
) values (
    source.product_id, source.product_name, source.demand_change_pct, source.margin_pct, source.active_flag
);

prompt [6/8] seed sc_routes
merge into sc_routes target
using (
    select 5001 as route_id, 'PORT' as origin_type, 3001 as origin_id, 'WAREHOUSE' as destination_type, 4002 as destination_id, 'RAIL' as transport_mode, 2.5 as transit_days, 140.00 as cost_per_ton, 0.15 as risk_factor from dual
    union all
    select 5002, 'PORT', 3003, 'WAREHOUSE', 4002, 'TRUCK', 3.0, 210.00, 0.28 from dual
    union all
    select 5003, 'PORT', 3002, 'WAREHOUSE', 4001, 'INTERMODAL', 1.8, 165.00, 0.09 from dual
) source
on (target.route_id = source.route_id)
when matched then update set
    target.origin_type = source.origin_type,
    target.origin_id = source.origin_id,
    target.destination_type = source.destination_type,
    target.destination_id = source.destination_id,
    target.transport_mode = source.transport_mode,
    target.transit_days = source.transit_days,
    target.cost_per_ton = source.cost_per_ton,
    target.risk_factor = source.risk_factor
when not matched then insert (
    route_id, origin_type, origin_id, destination_type, destination_id, transport_mode, transit_days, cost_per_ton, risk_factor
) values (
    source.route_id, source.origin_type, source.origin_id, source.destination_type, source.destination_id, source.transport_mode, source.transit_days, source.cost_per_ton, source.risk_factor
);

prompt [7/8] seed sc_shipments
merge into sc_shipments target
using (
    select 'SHP-9021' as shipment_id, 'SKU-500' as product_id, 'Busan Facility' as origin_name, 'Newark Inventory Hub' as destination_name, 1200 as quantity, 'IN_TRANSIT' as status, 3.5 as eta_days, 0.22 as risk_score from dual
    union all
    select 'SHP-9022', 'SKU-700', 'Shenzhen Facility', 'DFW Logistics Hub', 850, 'CUSTOMS_HOLD', 5.0, 0.68 from dual
    union all
    select 'SHP-9023', 'SKU-900', 'Monterrey Plant', 'Chicago Crossdock Hub', 2400, 'DELIVERED', 0.0, 0.05 from dual
) source
on (target.shipment_id = source.shipment_id)
when matched then update set
    target.product_id = source.product_id,
    target.origin_name = source.origin_name,
    target.destination_name = source.destination_name,
    target.quantity = source.quantity,
    target.status = source.status,
    target.eta_days = source.eta_days,
    target.risk_score = source.risk_score
when not matched then insert (
    shipment_id, product_id, origin_name, destination_name, quantity, status, eta_days, risk_score
) values (
    source.shipment_id, source.product_id, source.origin_name, source.destination_name, source.quantity, source.status, source.eta_days, source.risk_score
);

prompt [8/8] seed sc_disruptions
merge into sc_disruptions target
using (
    select 6001 as disruption_id, 'Long Beach Gateway' as location_name, 'Port Congestion' as disruption_type, 'HIGH' as severity, 0.75 as impact_score, 'Y' as active_flag from dual
    union all
    select 6002, 'Monterrey Corridor', 'Customs Inspection Backlog', 'MEDIUM', 0.45, 'Y' from dual
) source
on (target.disruption_id = source.disruption_id)
when matched then update set
    target.location_name = source.location_name,
    target.disruption_type = source.disruption_type,
    target.severity = source.severity,
    target.impact_score = source.impact_score,
    target.active_flag = source.active_flag
when not matched then insert (
    disruption_id, location_name, disruption_type, severity, impact_score, active_flag
) values (
    source.disruption_id, source.location_name, source.disruption_type, source.severity, source.impact_score, source.active_flag
);

commit;
prompt Seed data loaded successfully.
