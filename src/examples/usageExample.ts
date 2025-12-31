import {
  generateScriptFromMaterials,
  generateSlideImages,
  refineContent,
  withRetry,
} from '@/services/openaiService';

async function createEducationalVideo() {
  console.log('🎬 Iniciando criação de vídeo educacional...');

  const materials = `
    O ciclo da água é um processo contínuo de circulação da água na Terra.
    Principais etapas: evaporação, condensação, precipitação e coleta.
    A energia solar é o motor principal do ciclo.
    Aproximadamente 71% da superfície terrestre é coberta por água.
  `;

  const script = await withRetry(() =>
    generateScriptFromMaterials(materials, {
      topic: 'O Ciclo da Água',
      targetAudience: 'middleSchool',
      desiredDuration: 5,
      style: 'engaging',
    }),
  );

  console.log(`✅ Script gerado: "${script.title}"`);
  console.log(
    `   ${script.slides.length} slides, ${script.estimatedDuration} min`,
  );

  const images = await generateSlideImages(
    script.slides,
    'illustrated',
    script.targetAudience,
  );
  console.log(`✅ ${images.size} imagens geradas`);

  const slideToRefine = script.slides[1];
  const textContent = slideToRefine.content
    .filter((content) => content.type === 'text')
    .map((content) => ('content' in content ? content.content : ''))
    .join(' ');

  const refinedContent = await refineContent(textContent, {
    targetAudience: 'middleSchool',
    refinementGoals: ['clarity', 'engagement'],
    preserveKeyPoints: true,
  });

  console.log('✅ Conteúdo refinado:');
  console.log(
    `   Score de legibilidade: ${refinedContent.readabilityScore}/100`,
  );
  console.log(`   Melhorias: ${refinedContent.improvements.join(', ')}`);

  return { script, images, refinedContent };
}

createEducationalVideo()
  .then(() => console.log('🎉 Vídeo criado com sucesso!'))
  .catch((error) => console.error('❌ Erro:', error.message));
