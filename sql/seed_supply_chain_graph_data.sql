set define off

prompt [1/11] seed gc_suppliers
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

prompt [2/11] seed gc_plants
merge into gc_plants target
using (
    select 2001 as plant_id, 'Colu    select 2001 as plant_idame,    ses     select 2001 as plant_id, 'Colu    select 2001 as plant_idame,    ses     select 2001 as plant_id, 'Colu    select 2001 as plant_idame,    ses     selecselect 2003, 'Ra    select 2001 as plant_id, 'Colu    select 2001 as plant_idame, nt_i    source.pla    select 2001 as plant_id, 'Colu    select 2001 as plant_idame,   la    sel,
    select 2001 as plant_id, 'Colu    sele
                             so                             so                so                             so          se                             so            ut                             so            ource.plant_id, source.plant_name, source.cycl                             t,                             so                             so                sosing (
    select 3001 as port_id, 'Houston' as port_name, 54 as eta_hours, 0.31 as delay_risk_score, 'Y' as active_flag from dual
    union all
    select 3002, 'Savannah', 26, 0.14, 'Y' from dual
    union all
    select 3003, 'Long Beach', 62, 0.41, 'Y' from dual
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

prompt [4/11] seed sc_warehouses
merge into sc_warehouses target
using (
    select 4001 as warehouse_id, 'Newark Inventory Hub' as warehouse_name, 4226 as inventory_units, 95 as fill_rate_pct, 'Y' as active_flag from dual
    union all
    select 4002, 'DFW Hub', 3180, 97, 'Y' from dual
    union all
    select 4003, 'Chicago Crossdock', 2875, 93, 'Y' from dual
) source
on (target.warehouse_id = source.warehouse_id)
when matched then update set
    target.warehouse_name = source.war    targete,
                                                    
       get.f       get.f       get.f       gect,
       get.f       get.= sour       get.f       get.= sour       getse       get.f       get.= sour       getin       get.f       get.= sour       get.f       gs (
    source.warehouse_id, source.warehouse_name    source.warehouse_id,  source.fill_rate_pct, source.active_flag
);

prompt [5/11] seed sc_products
merge into sc_products target
using (
    select 'SKU-500' as product_id, 'Sustainable Widget 500' as product_name, 8 as demand_change_pct, 30    select 'SKU-500' as prive_fl    sem dual
    union all
    select 'SKU-700', 'Low Carbon Kit 700', -3, 26, 'Y' from dual
    union all
    select 'SKU-900', 'Circular Sensor 900', 11, 22, 'Y' from dual
) source
on (target.product_id = source.product_id)
when matched then update set
    target.product_name = source.product_name,
    target.demand_change_pct = source.demand_change_pct,
    target.margin_pct = source.margin_pct,
    target.active_flag = source.ac    target.active_flag = source.ac    target.activet_    target.active_flag = source.ac    target.ct, active_flag
) values (
    source.product_id, source.product_name, source.demand_change_pct, source.margin_pct, source.active_flag
);

commit;
