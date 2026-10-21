import { TestBed } from '@angular/core/testing';
import { supabase } from './supabase';
import {
  ClientesService,
  DadosCliente,
  normalizarDadosCliente,
  validarCnpj,
  validarCpf,
  validarDadosCliente,
} from './clientes';

describe('clientes', () => {
  const dadosPessoaFisica: DadosCliente = {
    tipo_pessoa: 'fisica',
    nome: '  Maria Silva  ',
    documento: '529.982.247-25',
    email: ' maria@example.com ',
    telefone: ' (11) 99999-1234 ',
    observacoes: ' Cliente teste ',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('valida CPF e CNPJ e permite cadastro sem documento', () => {
    expect(validarCpf('529.982.247-25')).toBe(true);
    expect(validarCpf('111.111.111-11')).toBe(false);
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
    expect(validarCnpj('11.111.111/1111-11')).toBe(false);
    expect(validarDadosCliente({ ...dadosPessoaFisica, documento: '' })).toBeNull();
  });

  it('exige nome, valida documento pelo tipo de pessoa e valida e-mail opcional', () => {
    expect(validarDadosCliente({ ...dadosPessoaFisica, nome: '  ' })).toContain('nome');
    expect(validarDadosCliente({ ...dadosPessoaFisica, documento: '123' })).toContain('CPF');
    expect(validarDadosCliente({
      ...dadosPessoaFisica,
      tipo_pessoa: 'juridica',
      documento: '123',
    })).toContain('CNPJ');
    expect(validarDadosCliente({ ...dadosPessoaFisica, email: 'inválido' })).toContain('e-mail');
  });

  it('normaliza espaços e pontuação do documento antes de persistir', () => {
    expect(normalizarDadosCliente(dadosPessoaFisica)).toEqual({
      tipo_pessoa: 'fisica',
      nome: 'Maria Silva',
      documento: '52998224725',
      email: 'maria@example.com',
      telefone: '(11) 99999-1234',
      observacoes: 'Cliente teste',
    });
    expect(normalizarDadosCliente({ ...dadosPessoaFisica, documento: '', email: '', telefone: '' }))
      .toMatchObject({ documento: null, email: null, telefone: null });
  });

  it('cria cliente usando o usuário autenticado e não recebe user_id do formulário', async () => {
    const cliente = {
      id: '42',
      created_at: '2026-10-20T12:00:00Z',
      updated_at: null,
      user_id: 'authenticated-user',
      ...normalizarDadosCliente(dadosPessoaFisica),
      ativo: true,
    };
    const getUser = vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: { user: { id: 'authenticated-user' } },
      error: null,
    } as never);
    const query = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: cliente, error: null }),
    };
    query.insert.mockReturnValue(query);
    query.select.mockReturnValue(query);
    const from = vi.spyOn(supabase, 'from').mockReturnValue(query as never);
    const service = TestBed.inject(ClientesService);

    await expect(service.criar(dadosPessoaFisica)).resolves.toEqual(cliente);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('Clientes');
    expect(query.insert).toHaveBeenCalledWith({
      ...normalizarDadosCliente(dadosPessoaFisica),
      user_id: 'authenticated-user',
    });
    expect(query.insert.mock.calls[0][0]).not.toHaveProperty('id');
  });

  it('não envia user_id em uma atualização', async () => {
    const query = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: '42', ...normalizarDadosCliente(dadosPessoaFisica), ativo: true },
        error: null,
      }),
    };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    vi.spyOn(supabase, 'from').mockReturnValue(query as never);
    const service = TestBed.inject(ClientesService);

    await service.atualizar('user-1', '42', dadosPessoaFisica);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.update.mock.calls[0][0]).not.toHaveProperty('user_id');
  });

  it('desativa sem excluir e restringe a atualização ao proprietário', async () => {
    const query = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: '42' }, error: null }),
      delete: vi.fn(),
    };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    vi.spyOn(supabase, 'from').mockReturnValue(query as never);
    const service = TestBed.inject(ClientesService);

    await service.desativar('user-1', '42');
    expect(query.update).toHaveBeenCalledWith({ ativo: false });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.delete).not.toHaveBeenCalled();
  });

  it('devolve erros de autorização como mensagens compreensíveis', async () => {
    const query = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      }),
    };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    vi.spyOn(supabase, 'from').mockReturnValue(query as never);
    const service = TestBed.inject(ClientesService);

    await expect(service.desativar('user-1', '42')).rejects.toThrow('não tem permissão');
  });

  it('consulta compras do cliente com paginação e sem excluir vendas canceladas', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    vi.spyOn(supabase, 'from').mockReturnValue(query as never);
    const service = TestBed.inject(ClientesService);

    await expect(service.listarCompras('user-1', '42', {
      pagina: 1,
      tamanhoPagina: 15,
    })).resolves.toEqual({ vendas: [], total: 0 });
    expect(query.eq).toHaveBeenCalledWith('cliente_id', '42');
    expect(query.range).toHaveBeenCalledWith(15, 29);
    expect(query.eq).not.toHaveBeenCalledWith('status', expect.anything());
  });
});
