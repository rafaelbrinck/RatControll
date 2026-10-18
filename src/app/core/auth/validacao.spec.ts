import { TestBed } from '@angular/core/testing';
import { Validacao } from './validacao';

describe('Validacao', () => {
  let service: Validacao;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Validacao);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
