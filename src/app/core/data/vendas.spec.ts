import { TestBed } from '@angular/core/testing';
import { ItemEstoque } from './estoque';
import { supabase } from './supabase';
import {
  adicionarItemCarrinho,
  calcularResumoCarrinho,
  FinalizarVendaError,
  ItemCarrinho,
  atualizarQuantidadeCarrinho,
  removerItemCarrinho,
  validarCarrinho,
  VendasService,
} from './vendas';

describe('vendas', () => {
  const estoque: ItemEstoque = {
    id: 17,
    created_at: '2026-10-20T12:00:00.000Z',
    user_id: 'user-1',
    quantidade: 8,
    descricao: 'Rato Wistar',
    valor: 12,
    tipo_animal: 'Wistar',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adiciona um item e incrementa a linha existente sem duplicar', () => {
    const umaLinha = adicionarItemCarrinho([], estoque);
    const duasUnidades = adicionarItemCarrinho(umaLinha, estoque);

    expect(duasUnidades).toHaveLength(1);
    expect(duasUnidades[0].quantidade).toBe(2);
    expect(duasUnidades[0].estoqueId).toBe(estoque.id);
  });

  it('calcula bruto, desconto por unidade, desconto geral e total em centavos', () => {
    const carrinho: ItemCarrinho[] = [{
      estoqueId: 17,
      descricao: 'Rato Wistar',
      tipoAnimal: 'Wistar',
      quantidadeDisponivel: 8,
      quantidade: 5,
      valorUnitarioCentavos: 1200,
      descontoUnitarioCentavos: 200,
    }];

    expect(calcularResumoCarrinho(carrinho, 500)).toEqual({
      valorBrutoCentavos: 6000,
      descontosItensCentavos: 1000,
      descontoGeralCentavos: 500,
      valorTotalCentavos: 4500,
    });
  });

  it('aumenta, diminui e remove a linha do carrinho', () => {
    const carrinho = adicionarItemCarrinho([], estoque);
    const aumentado = atualizarQuantidadeCarrinho(carrinho, estoque.id, 2);
    const diminuido = atualizarQuantidadeCarrinho(aumentado, estoque.id, 1);
    const removido = removerItemCarrinho(diminuido, estoque.id);

    expect(aumentado[0].quantidade).toBe(2);
    expect(diminuido[0].quantidade).toBe(1);
    expect(removido).toEqual([]);
  });

  it('rejeita quantidades inválidas e descontos acima do preço unitário', () => {
    const linha: ItemCarrinho = {
      estoqueId: 17,
      descricao: 'Rato Wistar',
      tipoAnimal: 'Wistar',
      quantidadeDisponivel: 8,
      quantidade: 9,
      valorUnitarioCentavos: 1200,
      descontoUnitarioCentavos: 0,
    };
    expect(validarCarrinho([linha], 0)).toContain('excede o saldo');

    expect(validarCarrinho([{ ...linha, quantidade: 1, descontoUnitarioCentavos: 1201 }], 0))
      .toContain('desconto por unidade');
    expect(validarCarrinho([{ ...linha, quantidade: 1 }], 0.5)).toContain('desconto geral');
  });

  it('envia apenas os campos requeridos para a RPC e devolve o identificador', async () => {
    const chamada = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: 321,
      error: null,
    } as never);
    const service = TestBed.inject(VendasService);

    await expect(service.finalizar([
      { estoque_id: 17, quantidade: 2, valor_unitario: 12, desconto_unitario: 1.25 },
    ], 350)).resolves.toBe('321');
    expect(chamada).toHaveBeenCalledWith('finalizar_venda', {
      p_itens: [{ estoque_id: 17, quantidade: 2, valor_unitario: 12, desconto_unitario: 1.25 }],
      p_desconto_total: 3.5,
      p_cliente_id: null,
    });
  });

  it('envia o cliente opcional na assinatura RPC estendida', async () => {
    const chamada = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: '321',
      error: null,
    } as never);
    const service = TestBed.inject(VendasService);

    await service.finalizar(
      [{ estoque_id: 17, quantidade: 1, valor_unitario: 12, desconto_unitario: 0 }],
      0,
      '9007199254740999',
    );
    expect(chamada).toHaveBeenCalledWith('finalizar_venda', {
      p_itens: [{ estoque_id: 17, quantidade: 1, valor_unitario: 12, desconto_unitario: 0 }],
      p_desconto_total: 0,
      p_cliente_id: '9007199254740999',
    });
  });

  it('retorna erros conhecidos do banco sem simular sucesso', async () => {
    const chamada = vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'Estoque insuficiente' },
    } as never);
    const service = TestBed.inject(VendasService);

    await expect(service.finalizar([], 0)).rejects.toMatchObject({
      message: 'Estoque insuficiente',
      resultadoIncerto: false,
    });
  });

  it('reporta erro de autorização retornado pelo banco', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    } as never);
    const service = TestBed.inject(VendasService);

    await expect(service.finalizar([], 0)).rejects.toMatchObject({
      message: 'Seu usuário não tem permissão para registrar esta venda. Detalhes do Supabase: permission denied',
      resultadoIncerto: false,
    });
  });

  it('trata as validações RAISE EXCEPTION da função como rejeições explícitas', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Estoque insuficiente para o item 17.' },
    } as never);
    const service = TestBed.inject(VendasService);

    await expect(service.finalizar([], 0)).rejects.toMatchObject({
      message: 'Estoque insuficiente para o item 17.',
      resultadoIncerto: false,
    });
  });

  it('trata erros sem código PostgreSQL como resultado incerto', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { code: '', message: 'fetch failed' },
    } as never);
    const service = TestBed.inject(VendasService);

    await expect(service.finalizar([], 0)).rejects.toMatchObject({
      resultadoIncerto: true,
      message: expect.stringContaining('Consulte o histórico'),
    });
  });

  it('informa sessão expirada quando auth.uid() está ausente', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Usuário não autenticado.' },
    } as never);
    const service = TestBed.inject(VendasService);

    await expect(service.finalizar([], 0)).rejects.toMatchObject({
      message: 'Sua sessão expirou. Entre novamente para registrar a venda.',
      resultadoIncerto: false,
    });
  });

  it('marca falhas de transporte como resultado incerto sem repetir a RPC', async () => {
    const chamada = vi.spyOn(supabase, 'rpc').mockRejectedValue(new Error('fetch failed'));
    const service = TestBed.inject(VendasService);

    let resultado: unknown;
    try {
      await service.finalizar([], 0);
    } catch (error) {
      resultado = error;
    }

    expect(resultado).toBeInstanceOf(FinalizarVendaError);
    expect((resultado as FinalizarVendaError).resultadoIncerto).toBe(true);
    expect(chamada).toHaveBeenCalledTimes(1);
  });

  it('marca uma resposta sem identificador como resultado incerto', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: null,
    } as never);
    const service = TestBed.inject(VendasService);

    await expect(service.finalizar([], 0)).rejects.toMatchObject({
      resultadoIncerto: true,
    });
  });

  it('não apresenta um BIGINT impreciso como identificador confirmado', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: Number.MAX_SAFE_INTEGER + 1,
      error: null,
    } as never);
    const service = TestBed.inject(VendasService);

    await expect(service.finalizar([], 0)).rejects.toMatchObject({
      resultadoIncerto: true,
    });
  });

  it('retorna histórico vazio com os filtros e a paginação solicitados', async () => {
    const consulta = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      ilike: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    };
    Object.values(consulta).forEach((metodo) => metodo.mockReturnValue(consulta));
    consulta.range.mockResolvedValue({ data: [], error: null, count: 0 });
    vi.spyOn(supabase, 'from').mockReturnValue(consulta as never);
    const service = TestBed.inject(VendasService);

    await expect(service.listarHistorico('user-1', {
      pagina: 1,
      tamanhoPagina: 15,
      status: 'finalizada',
      id: '321',
      cliente: 'Maria Silva',
    })).resolves.toEqual({ vendas: [], total: 0 });
    expect(consulta.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(consulta.eq).toHaveBeenCalledWith('status', 'finalizada');
    expect(consulta.eq).toHaveBeenCalledWith('id', '321');
    expect(consulta.ilike).toHaveBeenCalledWith('cliente_nome', '%Maria Silva%');
    expect(consulta.range).toHaveBeenCalledWith(15, 29);
  });

  it('escapa curingas em buscas por nome de cliente', async () => {
    const consulta = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      ilike: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    };
    Object.values(consulta).forEach((metodo) => metodo.mockReturnValue(consulta));
    consulta.range.mockResolvedValue({ data: [], error: null, count: 0 });
    vi.spyOn(supabase, 'from').mockReturnValue(consulta as never);
    const service = TestBed.inject(VendasService);

    await service.listarHistorico('user-1', {
      pagina: 0,
      tamanhoPagina: 15,
      cliente: 'Maria_%',
    });

    expect(consulta.ilike).toHaveBeenCalledWith('cliente_nome', '%Maria\\_\\%%');
  });

  it('não consulta o histórico quando o identificador pesquisado não é numérico', async () => {
    const de = vi.spyOn(supabase, 'from');
    const service = TestBed.inject(VendasService);

    await expect(service.listarHistorico('user-1', {
      pagina: 0,
      tamanhoPagina: 15,
      id: 'invalid',
    })).resolves.toEqual({ vendas: [], total: 0 });
    expect(de).not.toHaveBeenCalled();
  });

  it('carrega uma venda e os detalhes dos itens sem depender de uma relação implícita', async () => {
    const venda = {
      id: '321',
      created_at: '2026-10-20T12:00:00.000Z',
      status: 'finalizada' as const,
      valor_bruto: 24,
      desconto_total: 2.5,
      valor_total: 21.5,
    };
    const item = {
      id: '55',
      venda_id: '321',
      estoque_id: '17',
      produto_descricao: 'Rato Wistar',
      quantidade: 2,
      valor_unitario: 12,
      desconto_unitario: 1.25,
      subtotal: 21.5,
    };
    const vendaQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: venda, error: null }),
    };
    vendaQuery.select.mockReturnValue(vendaQuery);
    vendaQuery.eq.mockReturnValue(vendaQuery);

    const itensQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue({ data: [item], error: null }),
    };
    itensQuery.select.mockReturnValue(itensQuery);
    itensQuery.eq.mockReturnValue(itensQuery);
    vi.spyOn(supabase, 'from')
      .mockReturnValueOnce(vendaQuery as never)
      .mockReturnValueOnce(itensQuery as never);
    const service = TestBed.inject(VendasService);

    await expect(service.obterDetalhes('user-1', '321')).resolves.toEqual({
      venda,
      itens: [item],
    });
    expect(vendaQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(itensQuery.eq).toHaveBeenCalledWith('venda_id', '321');
  });

  it('apresenta erro quando as tabelas de histórico não estão disponíveis', async () => {
    const consulta = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      range: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST205', message: 'table not found' },
        count: null,
      }),
    };
    Object.values(consulta).forEach((metodo) => metodo.mockReturnValue(consulta));
    consulta.range.mockResolvedValue({
      data: null,
      error: { code: 'PGRST205', message: 'table not found' },
      count: null,
    });
    vi.spyOn(supabase, 'from').mockReturnValue(consulta as never);
    const service = TestBed.inject(VendasService);

    await expect(service.listarHistorico('user-1', {
      pagina: 0,
      tamanhoPagina: 15,
    })).rejects.toThrow('O histórico de vendas ainda não está configurado');
  });
});
