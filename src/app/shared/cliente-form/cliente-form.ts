import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Cliente,
  DadosCliente,
  TipoPessoa,
  validarDadosCliente,
} from '../../core/data/clientes';

@Component({
  selector: 'app-cliente-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cliente-form.html',
})
export class ClienteFormComponent {
  @Input() cliente?: Cliente;
  @Input() mostrarObservacoes = true;
  @Input() textoBotao = 'Salvar cliente';
  @Input() salvando = false;
  @Input() erroServidor = '';
  @Output() salvar = new EventEmitter<DadosCliente>();
  @Output() cancelar = new EventEmitter<void>();

  tipoPessoa: TipoPessoa = 'fisica';
  nome = '';
  documento = '';
  email = '';
  telefone = '';
  observacoes = '';
  erroValidacao = '';

  ngOnChanges(): void {
    this.tipoPessoa = this.cliente?.tipo_pessoa ?? 'fisica';
    this.nome = this.cliente?.nome ?? '';
    this.documento = this.cliente?.documento ?? '';
    this.email = this.cliente?.email ?? '';
    this.telefone = this.cliente?.telefone ?? '';
    this.observacoes = this.cliente?.observacoes ?? '';
  }

  get rotuloDocumento(): string {
    return this.tipoPessoa === 'fisica' ? 'CPF' : 'CNPJ';
  }

  enviar(): void {
    const dados: DadosCliente = {
      tipo_pessoa: this.tipoPessoa,
      nome: this.nome,
      documento: this.documento,
      email: this.email,
      telefone: this.telefone,
      observacoes: this.mostrarObservacoes ? this.observacoes : '',
    };
    this.erroValidacao = validarDadosCliente(dados) ?? '';
    if (this.erroValidacao || this.salvando) return;

    this.salvar.emit(dados);
  }
}
