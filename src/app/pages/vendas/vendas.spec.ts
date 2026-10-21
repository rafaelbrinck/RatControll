import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { Cliente, ClientesService, DadosCliente } from '../../core/data/clientes';
import { EstoqueService, ItemEstoque } from '../../core/data/estoque';
import { FinalizarVendaError, VendasService } from '../../core/data/vendas';
import { VendasPage } from './vendas';

describe('VendasPage', () => {
  const item: ItemEstoque = {
    id: 17,
    created_at: '2026-10-20T12:00:00.000Z',
    user_id: 'user-1',
    quantidade: 8,
    descricao: 'Rato Wistar',
    valor: 12,
    tipo_animal: 'Wistar',
  };
  const cliente: Cliente = {
    id: '42',
    created_at: '2026-10-20T12:00:00.000Z',
    updated_at: null,
    user_id: 'user-1',
    tipo_pessoa: 'fisica',
    nome: 'Maria Silva',
    documento: '52998224725',
    email: null,
    telefone: null,
    observacoes: null,
    ativo: true,
  };
  let fixture: ComponentFixture<VendasPage>;
  let page: VendasPage;
  let estoqueStub: {
    itens: ReturnType<typeof signal<ItemEstoque[]>>;
    listar: ReturnType<typeof vi.fn>;
  };
  let vendasStub: {
    finalizar: ReturnType<typeof vi.fn>;
    listarHistorico: ReturnType<typeof vi.fn>;
    obterDetalhes: ReturnType<typeof vi.fn>;
  };
  let clientesStub: {
    buscarAtivos: ReturnType<typeof vi.fn>;
    criar: ReturnType<typeof vi.fn>;
    obterAtivo: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    globalThis.sessionStorage.removeItem('ratcontroll:vendas:confirmacao-pendente');
    estoqueStub = {
      itens: signal([item]),
      listar: vi.fn().mockResolvedValue([item]),
    };
    vendasStub = {
      finalizar: vi.fn().mockResolvedValue('321'),
      listarHistorico: vi.fn().mockResolvedValue({ vendas: [], total: 0 }),
      obterDetalhes: vi.fn(),
    };
    clientesStub = {
      buscarAtivos: vi.fn().mockResolvedValue([cliente]),
      criar: vi.fn().mockResolvedValue(cliente),
      obterAtivo: vi.fn().mockResolvedValue(cliente),
    };

    await TestBed.configureTestingModule({
      imports: [VendasPage],
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            getUserLogado: () => 'user-1',
            restaurarSessao: vi.fn().mockResolvedValue(true),
            logout: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: EstoqueService, useValue: estoqueStub },
        { provide: VendasService, useValue: vendasStub },
        { provide: ClientesService, useValue: clientesStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VendasPage);
    page = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.sessionStorage.removeItem('ratcontroll:vendas:confirmacao-pendente');
    fixture.destroy();
  });

  it('permite aumentar, diminuir e remover a quantidade selecionada', () => {
    page.adicionar(item);
    page.incrementar(item.id);
    expect(page.carrinho()[0].quantidade).toBe(2);

    page.decrementar(item.id);
    expect(page.carrinho()[0].quantidade).toBe(1);

    page.remover(item.id);
    expect(page.carrinho()).toEqual([]);
  });

  it('preserva o carrinho quando o banco não confirma a venda', async () => {
    vendasStub.finalizar.mockRejectedValue(new Error('Estoque insuficiente'));
    page.adicionar(item);
    await page.confirmarVenda();

    expect(page.carrinho()).toHaveLength(1);
    expect(page.erro()).toBe('Estoque insuficiente');
  });

  it('faz uma única chamada quando a confirmação recebe cliques repetidos', async () => {
    let concluir!: (id: string) => void;
    vendasStub.finalizar.mockImplementation(() => new Promise<string>((resolve) => {
      concluir = resolve;
    }));
    page.adicionar(item);

    const primeiraConfirmacao = page.confirmarVenda();
    const segundaConfirmacao = page.confirmarVenda();
    await Promise.resolve();

    expect(vendasStub.finalizar).toHaveBeenCalledTimes(1);
    concluir('321');
    await Promise.all([primeiraConfirmacao, segundaConfirmacao]);
    expect(page.carrinho()).toEqual([]);
    expect(page.mensagem()).toContain('321');
    expect(vendasStub.finalizar).toHaveBeenCalledWith(
      [{ estoque_id: 17, quantidade: 1, valor_unitario: 12, desconto_unitario: 0 }],
      0,
      null,
    );
  });

  it('mantém o carrinho e bloqueia a nova confirmação após resultado incerto', async () => {
    vendasStub.finalizar.mockRejectedValue(new FinalizarVendaError('fetch failed', true));
    page.adicionar(item);
    await page.confirmarVenda();

    expect(page.carrinho()).toHaveLength(1);
    expect(page.resultadoIncerto()).toBe(true);
    expect(globalThis.sessionStorage.getItem('ratcontroll:vendas:confirmacao-pendente')).toBe('1');
    await page.confirmarVenda();
    expect(vendasStub.finalizar).toHaveBeenCalledTimes(1);
  });

  it('continua bloqueando novas vendas depois de recarregar com uma tentativa pendente', async () => {
    globalThis.sessionStorage.setItem('ratcontroll:vendas:confirmacao-pendente', '1');
    fixture.destroy();
    fixture = TestBed.createComponent(VendasPage);
    page = fixture.componentInstance;
    await fixture.whenStable();

    expect(page.resultadoIncerto()).toBe(true);
    expect(page.erro()).toContain('confirmação anterior');
  });

  it('cadastra e seleciona um cliente sem alterar os itens ou descontos do carrinho', async () => {
    const dados: DadosCliente = {
      tipo_pessoa: 'fisica',
      nome: 'Maria Silva',
      documento: '52998224725',
      email: '',
      telefone: '',
      observacoes: '',
    };
    page.adicionar(item);
    page.incrementar(item.id);
    page.alterarDescontoUnitario(item.id, 1.5);
    const carrinhoAntes = page.carrinho();
    page.abrirCadastroRapido();
    await page.salvarClienteRapido(dados);

    expect(page.modalClienteAberto()).toBe(false);
    expect(page.clienteSelecionado()).toEqual(cliente);
    expect(page.carrinho()).toEqual(carrinhoAntes);
  });

  it('envia o cliente selecionado e revalida que continua ativo antes da RPC', async () => {
    page.adicionar(item);
    page.selecionarCliente(cliente);
    await page.confirmarVenda();

    expect(clientesStub.obterAtivo).toHaveBeenCalledWith('user-1', cliente.id);
    expect(vendasStub.finalizar).toHaveBeenCalledWith(
      [{ estoque_id: 17, quantidade: 1, valor_unitario: 12, desconto_unitario: 0 }],
      0,
      cliente.id,
    );
  });

  it('preserva carrinho e não chama RPC se o cliente foi desativado', async () => {
    clientesStub.obterAtivo.mockRejectedValue(new Error('Este cliente está inativo.'));
    page.adicionar(item);
    page.selecionarCliente(cliente);
    await page.confirmarVenda();

    expect(page.carrinho()).toHaveLength(1);
    expect(vendasStub.finalizar).not.toHaveBeenCalled();
  });

  it('aplica a busca por cliente ao carregar o histórico de vendas', async () => {
    page.buscaClienteHistorico.set('Maria Silva');
    await page.carregarHistorico();

    expect(vendasStub.listarHistorico).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ cliente: 'Maria Silva' }),
    );
  });
});
