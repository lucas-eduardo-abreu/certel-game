/* Modelo 3D do mascote da Certel visto de costas, com ciclo de corrida.

   É uma releitura em formas simples (esferas, cápsulas, cilindros) do desenho
   oficial: boné verde de tela, cabelo loiro, camiseta azul, bermuda verde,
   luvas, meias e tênis. O jogo não carrega este arquivo: ele serve para
   gerar a folha de sprites (ver gerar_sprites.py).

   Convenções: Y para cima, o boneco corre para -Z, a câmera fica em +Z
   (ou seja, as costas do boneco ficam viradas para +Z). */

export const ALTURA_QUADRIL = 3.0;

const COR = {
  pele: '#fff385',
  cabelo: '#ffc20e',
  bone: '#2bab5c',
  tela: '#1f8f4b',
  camisa: '#0054a5',
  bermuda: '#23ad58',
  branco: '#ffffff'
};

/* opcoes.logo: imagem (Image ou canvas) do logo Certel para as costas da camiseta. */
export function criarMascote(THREE, opcoes) {
  opcoes = opcoes || {};
  // Sombreamento em degraus (visual de desenho) e contorno preto por casca invertida.
  const degraus = new THREE.DataTexture(
    new Uint8Array([150, 150, 150, 255, 212, 212, 212, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  degraus.minFilter = degraus.magFilter = THREE.NearestFilter;
  degraus.needsUpdate = true;

  const material = (cor, extra) =>
    new THREE.MeshToonMaterial(Object.assign({ color: cor, gradientMap: degraus }, extra || {}));

  const contorno = (espessura) => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { espessura: { value: espessura } },
    vertexShader: 'uniform float espessura; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normalize(normal) * espessura, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }'
  });
  const contornoPadrao = contorno(0.075);
  const contornoFino = contorno(0.045);

  function peca(geometria, mat, pai, posicao, escala, fino) {
    const malha = new THREE.Mesh(geometria, mat);
    if (posicao) { malha.position.set(posicao[0], posicao[1], posicao[2]); }
    if (escala) { malha.scale.set(escala[0], escala[1], escala[2]); }
    malha.add(new THREE.Mesh(geometria, fino ? contornoFino : contornoPadrao));
    pai.add(malha);
    return malha;
  }

  const mPele = material(COR.pele);
  const mCamisa = material(COR.camisa);
  const mBermuda = material(COR.bermuda);
  const mBranco = material(COR.branco);
  const mBone = material(COR.bone);
  const mCabelo = material(COR.cabelo);

  const raiz = new THREE.Group();
  const corpo = new THREE.Group();
  corpo.position.y = ALTURA_QUADRIL;
  raiz.add(corpo);

  // ----- Bermuda e pernas -----
  peca(new THREE.SphereGeometry(1, 32, 20), mBermuda, corpo, [0, 0.12, 0], [1.02, 0.62, 0.8]);

  function criarPerna(lado) {
    const quadril = new THREE.Group();
    quadril.position.set(lado * 0.5, 0, 0);
    corpo.add(quadril);
    peca(new THREE.CylinderGeometry(0.5, 0.47, 1.0, 24), mBermuda, quadril, [0, -0.5, 0]);
    peca(new THREE.CapsuleGeometry(0.17, 0.5, 6, 16), mPele, quadril, [0, -1.0, 0]);

    const joelho = new THREE.Group();
    joelho.position.y = -1.25;
    quadril.add(joelho);
    peca(new THREE.CapsuleGeometry(0.16, 0.85, 6, 16), mPele, joelho, [0, -0.5, 0]);
    const dobra = new THREE.TorusGeometry(0.24, 0.14, 12, 24);
    peca(dobra, mBranco, joelho, [0, -0.9, 0], null, true).rotation.x = Math.PI / 2;
    peca(dobra, mBranco, joelho, [0, -1.1, 0], [1.08, 1.08, 1], true).rotation.x = Math.PI / 2;

    // Tênis: comprido em Z, bico para -Z.
    const pe = new THREE.Group();
    pe.position.y = -1.25;
    joelho.add(pe);
    const sola = peca(new THREE.CapsuleGeometry(0.45, 1.0, 8, 20), mBranco, pe, [0, -0.3, -0.3], [1, 1, 0.42]);
    sola.rotation.x = Math.PI / 2;
    const cabedal = peca(new THREE.CapsuleGeometry(0.4, 0.8, 8, 20), mBermuda, pe, [0, -0.1, -0.2], [1, 1, 0.62]);
    cabedal.rotation.x = Math.PI / 2;
    peca(new THREE.SphereGeometry(0.4, 20, 14), mBranco, pe, [0, -0.14, -0.86], [1, 0.62, 1]);
    return { quadril, joelho, pe };
  }

  // ----- Tronco, braços e cabeça -----
  const tronco = new THREE.Group();
  tronco.position.y = 0.25;
  corpo.add(tronco);
  peca(new THREE.CapsuleGeometry(1.0, 0.9, 10, 32), mCamisa, tronco, [0, 1.35, 0], [1, 1, 0.78]);

  // Logo da Certel no meio das costas, acompanhando a curva da camiseta.
  if (opcoes.logo) {
    const LOGO_L = 1.34;
    const LOGO_A = LOGO_L * opcoes.logo.height / opcoes.logo.width;
    const estampa = new THREE.PlaneGeometry(LOGO_L, LOGO_A, 32, 1);
    const pontos = estampa.attributes.position;
    for (let i = 0; i < pontos.count; i++) {
      const x = pontos.getX(i);
      pontos.setZ(i, 0.78 * Math.sqrt(Math.max(0, 1 - x * x)) + 0.015);
    }
    estampa.computeVertexNormals();
    const textura = new THREE.CanvasTexture(opcoes.logo);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 4;
    const logo = new THREE.Mesh(estampa, material('#ffffff', { map: textura, transparent: true, alphaTest: 0.35 }));
    logo.position.y = 1.5;
    tronco.add(logo);
  }
  peca(new THREE.CylinderGeometry(0.27, 0.27, 0.7, 16), mPele, tronco, [0, 2.9, 0]);

  function criarBraco(lado) {
    const ombro = new THREE.Group();
    ombro.position.set(lado * 1.0, 2.25, 0);
    tronco.add(ombro);
    peca(new THREE.SphereGeometry(0.4, 20, 14), mCamisa, ombro);
    peca(new THREE.CylinderGeometry(0.37, 0.48, 0.95, 24), mCamisa, ombro, [0, -0.42, 0]);
    peca(new THREE.CapsuleGeometry(0.15, 0.6, 6, 16), mPele, ombro, [0, -1.05, 0]);

    const cotovelo = new THREE.Group();
    cotovelo.position.y = -1.35;
    ombro.add(cotovelo);
    peca(new THREE.CapsuleGeometry(0.145, 0.7, 6, 16), mPele, cotovelo, [0, -0.45, 0]);
    peca(new THREE.TorusGeometry(0.23, 0.13, 12, 24), mBranco, cotovelo, [0, -0.95, 0], null, true).rotation.x = Math.PI / 2;
    peca(new THREE.SphereGeometry(0.46, 20, 14), mBranco, cotovelo, [0, -1.36, 0], [1, 1.08, 1]);
    peca(new THREE.SphereGeometry(0.2, 14, 10), mBranco, cotovelo, [-lado * 0.36, -1.2, -0.12], null, true);
    return { ombro, cotovelo, lado };
  }

  const cabeca = new THREE.Group();
  cabeca.position.y = 2.95;
  cabeca.scale.setScalar(1.12);
  tronco.add(cabeca);
  peca(new THREE.SphereGeometry(1, 40, 28), mPele, cabeca, [0, 1.6, 0], [1.62, 1.72, 1.55]);
  peca(new THREE.SphereGeometry(0.34, 16, 12), mPele, cabeca, [-1.6, 1.3, 0.05], [0.6, 1, 0.8], true);
  peca(new THREE.SphereGeometry(0.34, 16, 12), mPele, cabeca, [1.6, 1.3, 0.05], [0.6, 1, 0.8], true);
  // Cabelo: um bloco cheio e "quadradinho" cobrindo a nuca, como no mascote
  // de pelúcia. É uma faixa da esfera da cabeça (do boné para baixo, por trás
  // e pelos lados) deformada para ter seção de quadrado de cantos redondos,
  // com a borda de baixo reta e arredondada por um tubo.
  const CABELO_FASE = [-0.12 * Math.PI, 1.24 * Math.PI];    // de um lado ao outro, por trás
  const CABELO_ALTURA = [0.34 * Math.PI, 0.68 * Math.PI];    // de dentro do boné até a base da nuca
  const CABELO_ESCALA = [1.7, 1.8, 1.66];
  const QUADRADO = 3.2;                                      // 2 = redondo; maior = mais quadrado

  // Perto do boné o cabelo é redondo e um pouco menor, para ficar escondido
  // dentro dele; da aba para baixo vai ficando quadrado (t de 0 a 1).
  function quadrar(x, z, t) {
    const n = 2 + (QUADRADO - 2) * t;
    const angulo = Math.atan2(z, x);
    const fator = (0.95 + 0.05 * t) /
      Math.pow(Math.pow(Math.abs(Math.cos(angulo)), n) + Math.pow(Math.abs(Math.sin(angulo)), n), 1 / n);
    return [x * fator, z * fator];
  }
  function transicao(theta) {
    const t = Math.min(1, Math.max(0, (theta - 0.4 * Math.PI) / (0.1 * Math.PI)));
    return t * t * (3 - 2 * t);
  }

  const geoCabelo = new THREE.SphereGeometry(1, 64, 20,
    CABELO_FASE[0], CABELO_FASE[1] - CABELO_FASE[0], CABELO_ALTURA[0], CABELO_ALTURA[1] - CABELO_ALTURA[0]);
  const pos = geoCabelo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const q = quadrar(pos.getX(i), pos.getZ(i), transicao(Math.acos(pos.getY(i))));
    pos.setXYZ(i, q[0], pos.getY(i), q[1]);
  }
  geoCabelo.computeVertexNormals();

  // Textura de pelúcia: fios curtos em dois tons de amarelo.
  const pelo = document.createElement('canvas');
  pelo.width = 512; pelo.height = 256;
  const gp = pelo.getContext('2d');
  gp.fillStyle = '#ffbf14'; gp.fillRect(0, 0, 512, 256);
  let semente = 7;
  const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  gp.lineCap = 'round';
  gp.globalAlpha = 0.45;
  for (let i = 0; i < 420; i++) {
    const x = aleatorio() * 512, y = aleatorio() * 256, tam = 10 + aleatorio() * 16;
    gp.strokeStyle = aleatorio() < 0.5 ? '#f0a500' : '#ffd23f';
    gp.lineWidth = 1.5 + aleatorio() * 1.5;
    gp.beginPath(); gp.moveTo(x, y); gp.lineTo(x + (aleatorio() - 0.5) * 6, y + tam); gp.stroke();
  }
  const texturaPelo = new THREE.CanvasTexture(pelo);
  texturaPelo.colorSpace = THREE.SRGBColorSpace;
  texturaPelo.wrapS = THREE.RepeatWrapping;
  const mPelo = material('#ffffff', { map: texturaPelo, side: THREE.DoubleSide });

  peca(geoCabelo, mPelo, cabeca, [0, 1.6, 0], CABELO_ESCALA);

  // Borda de baixo: um tubo grosso deixa a base reta e com cantos arredondados.
  const borda = [];
  for (let i = 0; i <= 48; i++) {
    const fase = CABELO_FASE[0] + (CABELO_FASE[1] - CABELO_FASE[0]) * i / 48;
    const raio = Math.sin(CABELO_ALTURA[1]);
    const q = quadrar(-Math.cos(fase) * raio, Math.sin(fase) * raio, 1);
    borda.push(new THREE.Vector3(q[0] * CABELO_ESCALA[0], 1.6 + Math.cos(CABELO_ALTURA[1]) * CABELO_ESCALA[1], q[1] * CABELO_ESCALA[2]));
  }
  peca(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(borda), 96, 0.16, 12, false), mPelo, cabeca, null, null, true);

  // Boné de tela, levemente virado para a direita como no desenho.
  const bone = new THREE.Group();
  bone.position.set(0, 1.95, 0);
  bone.rotation.y = -0.38;
  bone.rotation.z = -0.05;
  cabeca.add(bone);

  const tela = document.createElement('canvas');
  tela.width = 512; tela.height = 256;
  const g = tela.getContext('2d');
  g.fillStyle = COR.tela; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#0c5a2b'; g.lineWidth = 3;
  for (let i = -256; i < 768; i += 26) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke();
    g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke();
  }
  const texturaTela = new THREE.CanvasTexture(tela);
  texturaTela.colorSpace = THREE.SRGBColorSpace;
  const mTela = material('#ffffff', { map: texturaTela });

  const escalaCopa = [1.72, 1.5, 1.68];
  peca(new THREE.SphereGeometry(1, 40, 16, Math.PI, Math.PI, 0, 0.5 * Math.PI), mBone, bone, null, escalaCopa);
  peca(new THREE.SphereGeometry(1, 40, 16, 0, Math.PI, 0, 0.5 * Math.PI), mTela, bone, null, escalaCopa);
  peca(new THREE.SphereGeometry(0.17, 14, 10), mBone, bone, [0, 1.5, 0], null, true);
  // Aba (meio disco para a frente).
  peca(new THREE.CylinderGeometry(1.5, 1.5, 0.16, 40, 1, false, 0.5 * Math.PI, Math.PI), mBone, bone,
    [0, 0.06, -0.95], [1.05, 1, 1.15]);
  // Abertura traseira do boné (o cabelo aparece) e a tira de ajuste.
  const fundo = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#000000' }));
  fundo.position.set(0, 0.02, 1.672);
  bone.add(fundo);
  const abertura = new THREE.Mesh(new THREE.CircleGeometry(0.41, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: COR.cabelo }));
  abertura.position.set(0, 0.02, 1.68);
  bone.add(abertura);
  peca(new THREE.BoxGeometry(1.0, 0.16, 0.07), mBone, bone, [0, 0.05, 1.7], null, true);

  const rig = {
    raiz, corpo, tronco, cabeca,
    pernas: [criarPerna(-1), criarPerna(1)],
    bracos: [criarBraco(-1), criarBraco(1)]
  };
  posar(rig, 0);
  return rig;
}

/* Posiciona o boneco em um ponto do ciclo de corrida (fase de 0 a 1). */
export function posar(rig, fase) {
  const angulo = fase * Math.PI * 2;
  const s = Math.sin(angulo);

  // Sobe quando as pernas estão abertas (fase de voo) e desce no apoio.
  rig.corpo.position.y = ALTURA_QUADRIL + 0.32 * s * s;
  rig.corpo.position.x = 0.07 * s;
  rig.corpo.rotation.z = 0.045 * s;

  rig.tronco.rotation.x = -0.24;          // inclinado para a frente
  rig.tronco.rotation.y = 0.2 * s;        // gira com os braços
  rig.cabeca.rotation.x = 0.16;
  rig.cabeca.rotation.y = -0.14 * s;

  rig.pernas.forEach(function (perna, indice) {
    const a = angulo + indice * Math.PI;
    const coxa = Math.sin(a);
    perna.quadril.rotation.x = 0.95 * coxa;
    // Joelho dobra na recuperação (perna vindo para a frente) e estica no apoio.
    const dobra = Math.pow(0.5 + 0.5 * Math.cos(a + 0.35), 1.5);
    perna.joelho.rotation.x = -(0.18 + 1.3 * dobra);
    perna.pe.rotation.x = 0.4 * Math.max(0, coxa) - 0.05;
  });

  rig.bracos.forEach(function (braco, indice) {
    const a = angulo + (indice + 1) * Math.PI; // oposto à perna do mesmo lado
    const balanco = Math.sin(a);
    braco.ombro.rotation.x = 1.0 * balanco;
    braco.ombro.rotation.z = braco.lado * 0.24;
    braco.cotovelo.rotation.x = 1.25 + 0.3 * balanco;
  });
}
