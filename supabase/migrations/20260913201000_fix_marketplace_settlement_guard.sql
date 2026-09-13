-- Do not settle a payment if the listing was removed or changed while Checkout was open.
create or replace function public.settle_marketplace_sale(p_session text, p_payment_intent text default null)
returns public.marketplace_sales language plpgsql security definer set search_path = public as $$
declare v_sale public.marketplace_sales; v_parcel public.parcels;
begin
  select * into v_sale from public.marketplace_sales where stripe_session_id = p_session for update;
  if v_sale.id is null then raise exception 'Satış kaydı bulunamadı.'; end if;
  if v_sale.status = 'paid' then return v_sale; end if;
  if v_sale.status <> 'pending' then raise exception 'Satış artık aktif değil.'; end if;
  select * into v_parcel from public.parcels where id = v_sale.parcel_id for update;
  if v_parcel.id is null or v_parcel.owner_id <> v_sale.seller_id or v_parcel.listing is distinct from v_sale.price_tokens then raise exception 'İlan ödeme sırasında değişti.'; end if;
  update public.parcels set owner_id = v_sale.buyer_id, listing = null, bought_for = v_sale.price_tokens, updated_at = now() where id = v_sale.parcel_id;
  update public.marketplace_sales set status = 'paid', stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id), paid_at = now() where id = v_sale.id returning * into v_sale;
  insert into public.activity (user_id, action, parcel_id, amount) values (v_sale.buyer_id, 'buy_stripe', v_sale.parcel_id, v_sale.price_tokens);
  insert into public.activity (user_id, action, parcel_id, amount) values (v_sale.seller_id, 'sale_stripe', v_sale.parcel_id, v_sale.price_tokens);
  return v_sale;
end $$;
revoke all on function public.settle_marketplace_sale(text, text) from public, anon, authenticated;
grant execute on function public.settle_marketplace_sale(text, text) to service_role;
