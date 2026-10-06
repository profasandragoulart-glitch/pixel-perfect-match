CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  monthly_income numeric NOT NULL DEFAULT 5000,
  emergency_reserve numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  bucket text NOT NULL DEFAULT 'necessidades',
  category text NOT NULL DEFAULT 'Outros',
  occurred_on date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tx all" ON public.transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, emergency_reserve)
  VALUES (NEW.id, split_part(NEW.email, '@', 1), 4200);
  INSERT INTO public.transactions (user_id, description, amount, bucket, category, occurred_on) VALUES
  (NEW.id, 'Aluguel', 1500, 'necessidades', 'Moradia', date_trunc('month', current_date)::date + 4),
  (NEW.id, 'Conta de luz', 180, 'necessidades', 'Contas', date_trunc('month', current_date)::date + 7),
  (NEW.id, 'Supermercado Pão de Açúcar', 520, 'necessidades', 'Mercado', date_trunc('month', current_date)::date + 3),
  (NEW.id, 'Uber', 140, 'necessidades', 'Transporte', date_trunc('month', current_date)::date + 9),
  (NEW.id, 'Farmácia', 95, 'necessidades', 'Saúde', date_trunc('month', current_date)::date + 11),
  (NEW.id, 'iFood', 310, 'estilo', 'Delivery', date_trunc('month', current_date)::date + 6),
  (NEW.id, 'Netflix', 55, 'estilo', 'Assinaturas', date_trunc('month', current_date)::date + 1),
  (NEW.id, 'Spotify', 22, 'estilo', 'Assinaturas', date_trunc('month', current_date)::date + 1),
  (NEW.id, 'Academia (pouco usada)', 120, 'estilo', 'Assinaturas', date_trunc('month', current_date)::date + 2),
  (NEW.id, 'Restaurante', 260, 'estilo', 'Lazer', date_trunc('month', current_date)::date + 12),
  (NEW.id, 'Shopping', 480, 'estilo', 'Compras', date_trunc('month', current_date)::date + 13),
  (NEW.id, 'Tesouro SELIC', 600, 'futuro', 'Reserva', date_trunc('month', current_date)::date + 5);
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();