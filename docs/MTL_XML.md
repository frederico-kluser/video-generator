# Tutorial completo: Gerando arquivos de projeto Shotcut (.mlt) programaticamente

Criar projetos de vídeo programaticamente abre possibilidades extraordinárias para automação de edição em massa, geração dinâmica de conteúdo e integração com pipelines de produção. O formato MLT XML, utilizado pelo Shotcut e outros editores baseados no MLT Framework, oferece uma estrutura declarativa completa que pode ser gerada por código. Este tutorial apresenta tudo necessário para criar arquivos `.mlt` válidos e prontos para importação no Shotcut.

O MLT (Media Lovin' Toolkit) é um framework open-source de manipulação multimídia que serve como engine para editores como Shotcut e Kdenlive. Sua serialização XML espelha diretamente a API interna do framework, permitindo controle granular sobre todos os aspectos de um projeto de vídeo — desde clipes e trilhas até transições, filtros e keyframes.

---

## Anatomia do formato MLT XML

O arquivo `.mlt` segue uma hierarquia bem definida onde cada elemento representa um conceito específico do framework. A estrutura raiz começa com o elemento `<mlt>` que contém declarações de perfil, produtores de mídia, playlists, e o tractor principal que representa a timeline completa.

### Elemento raiz e declarações essenciais

Todo arquivo MLT válido começa com a declaração XML padrão seguida do elemento raiz `<mlt>`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<mlt LC_NUMERIC="C" version="7.0.0" root="/caminho/para/projeto" title="Meu Projeto">
  <!-- Conteúdo do projeto -->
</mlt>
```

| Atributo | Obrigatório | Descrição |
|----------|-------------|-----------|
| `LC_NUMERIC` | Não | Locale para parsing numérico (sempre usar `"C"` para portabilidade) |
| `version` | Não | Versão do MLT (ex: `"7.0.0"`) |
| `root` | Não | Caminho base para recursos com caminhos relativos |
| `title` | Não | Título do documento |
| `producer` | Não | IDREF para o produtor de saída padrão |

### Profile: Configurações de resolução e frame rate

O elemento `<profile>` define todas as propriedades de saída do vídeo. **Sem ele, o projeto pode não ser renderizado corretamente.**

```xml
<profile description="Full HD 1080p 30fps" 
         width="1920" 
         height="1080" 
         progressive="1" 
         sample_aspect_num="1" 
         sample_aspect_den="1" 
         display_aspect_num="16" 
         display_aspect_den="9" 
         frame_rate_num="30000" 
         frame_rate_den="1001" 
         colorspace="709"/>
```

| Atributo | Obrigatório | Descrição | Valores comuns |
|----------|-------------|-----------|----------------|
| `width` | **Sim** | Largura em pixels | 1920, 3840, 1280 |
| `height` | **Sim** | Altura em pixels | 1080, 2160, 720 |
| `frame_rate_num` | **Sim** | Numerador do frame rate | 30000, 24000, 25 |
| `frame_rate_den` | **Sim** | Denominador do frame rate | 1001 (para 29.97fps), 1 |
| `progressive` | **Sim** | 1=progressivo, 0=entrelaçado | 1 |
| `sample_aspect_num` | **Sim** | Numerador do aspect ratio do pixel | 1 |
| `sample_aspect_den` | **Sim** | Denominador do aspect ratio do pixel | 1 |
| `colorspace` | Não | Padrão de cor: "601" (SD) ou "709" (HD) | 709 |

**Profiles comuns pré-definidos:**
- **HD 720p 30fps**: `width="1280" height="720" frame_rate_num="30" frame_rate_den="1"`
- **Full HD 1080p 24fps**: `width="1920" height="1080" frame_rate_num="24" frame_rate_den="1"`
- **4K UHD 30fps**: `width="3840" height="2160" frame_rate_num="30" frame_rate_den="1"`

---

## Producers e Chains: Definindo fontes de mídia

Producers são os elementos fundamentais que geram frames — representam arquivos de vídeo, áudio, imagens, cores sólidas ou texto.

### Producer tradicional

```xml
<producer id="producer0" in="0" out="899">
  <property name="resource">media/video.mp4</property>
  <property name="mlt_service">avformat</property>
  <property name="audio_index">0</property>
  <property name="video_index">0</property>
</producer>
```

### Chain (MLT 7+ / Shotcut 21.05+)

A partir do MLT 7, o elemento `<chain>` substitui `<producer>` para serviços avformat, oferecendo suporte a **links** para processamento temporal eficiente:

```xml
<chain id="chain0" in="00:00:00.000" out="00:01:00.000">
  <property name="resource">media/video.mp4</property>
  <property name="mlt_service">avformat-novalidate</property>
  <property name="shotcut:hash">c5c7079e178ede8cfdb6849217681d85</property>
  <property name="shotcut:caption">video.mp4</property>
</chain>
```

### Tipos de producers disponíveis

**Vídeo/Áudio (avformat):**
```xml
<producer id="clip1">
  <property name="resource">video.mp4</property>
  <property name="mlt_service">avformat</property>
  <property name="seekable">1</property>
  <property name="audio_track">0</property>
</producer>
```

**Cor sólida:**
```xml
<producer id="black" mlt_service="color">
  <property name="resource">black</property>
  <property name="mlt_service">color</property>
  <property name="length">15000</property>
</producer>
```

**Imagem:**
```xml
<producer id="watermark">
  <property name="resource">logo.png</property>
  <property name="mlt_service">qimage</property>
  <property name="length">1000</property>
</producer>
```

**Texto (Pango):**
```xml
<producer id="title" mlt_service="pango">
  <property name="text">Título do Vídeo</property>
  <property name="font">Sans Bold 48</property>
  <property name="fgcolour">0xffffffff</property>
  <property name="bgcolour">0x00000000</property>
  <property name="align">center</property>
</producer>
```

---

## Playlists: Organizando clipes em sequência

Playlists organizam clips sequencialmente em uma única trilha. Cada playlist representa uma track na timeline.

```xml
<playlist id="playlist0">
  <property name="shotcut:video">1</property>
  <property name="shotcut:name">V1</property>
  
  <entry producer="producer0" in="0" out="299"/>
  <blank length="50"/>
  <entry producer="producer1" in="100" out="399"/>
</playlist>
```

### Entry: Referência a clips

O elemento `<entry>` referencia um producer com pontos de entrada/saída específicos:

```xml
<entry producer="producer_id" in="frame_inicio" out="frame_fim"/>
```

**Pontos importantes:**
- `in` e `out` são posições **absolutas** em frames relativos ao producer original
- O mesmo producer pode ser referenciado múltiplas vezes com diferentes in/out
- A duração do clip na timeline é `(out - in + 1)` frames

### Blank: Espaços vazios

```xml
<blank length="100"/>  <!-- 100 frames de silêncio/preto -->
```

---

## Tractors e Multitrack: Composição multi-trilha

O **tractor** é o container principal que combina múltiplas tracks com transições e filtros. Representa a timeline completa.

```xml
<tractor id="tractor0" in="0" out="999">
  <property name="shotcut">1</property>
  
  <multitrack id="multitrack0">
    <track producer="background"/>
    <track producer="playlist0"/>
    <track producer="playlist1"/>
    <track producer="playlist2" hide="1"/>  <!-- hide video -->
  </multitrack>
  
  <!-- Transições e filtros aqui -->
</tractor>
```

### Prioridade das tracks

**Tracks com índice menor têm prioridade MAIOR.** A track 0 é o fundo (background), e tracks superiores são overlays que aparecem apenas durante gaps ou quando transições as mesclam.

### Atributo hide para tracks

| Valor | Efeito |
|-------|--------|
| `0` | Mostra tudo (padrão) |
| `1` | Esconde vídeo |
| `2` | Silencia áudio |
| `3` | Esconde ambos |

---

## Transitions: Mesclando trilhas

Transições definem como duas tracks se combinam durante um período específico.

```xml
<transition id="transition0" in="250" out="299">
  <property name="a_track">1</property>
  <property name="b_track">2</property>
  <property name="mlt_service">luma</property>
  <property name="softness">0.1</property>
</transition>
```

### Transições de vídeo essenciais

**Dissolve (luma sem resource):**
```xml
<transition mlt_service="luma" in="0" out="24" a_track="0" b_track="1"/>
```

**Wipe com padrão:**
```xml
<transition mlt_service="luma" in="0" out="24" a_track="0" b_track="1">
  <property name="resource">luma01.pgm</property>
  <property name="reverse">0</property>
</transition>
```

**Composite (alpha blending com posição):**
```xml
<transition mlt_service="composite" in="0" out="100" a_track="0" b_track="1">
  <property name="geometry">10%/10%:80%x80%:100</property>
  <property name="fill">1</property>
  <property name="halign">centre</property>
  <property name="valign">centre</property>
</transition>
```

### Transição de áudio (crossfade)

```xml
<transition mlt_service="mix" in="250" out="299" a_track="0" b_track="1">
  <property name="start">0.0</property>
  <property name="end">1.0</property>
  <property name="combine">1</property>
</transition>
```

---

## Filters: Efeitos de áudio e vídeo

Filtros modificam frames e podem ser aplicados a producers, playlists, tracks ou tractors.

### Filtros de vídeo

**Brilho e contraste:**
```xml
<filter mlt_service="brightness">
  <property name="level">1.2</property>
</filter>

<filter mlt_service="avfilter.eq">
  <property name="av.brightness">0.1</property>
  <property name="av.contrast">1.2</property>
  <property name="av.saturation">1.1</property>
</filter>
```

**Escala de cinza:**
```xml
<filter mlt_service="greyscale">
  <property name="shotcut:filter">greyscale</property>
</filter>
```

**Transformação/Posição (affine):**
```xml
<filter mlt_service="affine">
  <property name="rect">10%/10%:80%x80%</property>
  <property name="background">colour:0x00000000</property>
</filter>
```

**Texto dinâmico (timecode):**
```xml
<filter mlt_service="dynamictext">
  <property name="argument">%timecode</property>
  <property name="geometry">10/10:400x50:100</property>
  <property name="family">Sans</property>
  <property name="size">24</property>
  <property name="fgcolour">#ffffffff</property>
</filter>
```

### Filtros de áudio

**Volume:**
```xml
<filter mlt_service="volume">
  <property name="gain">0.8</property>
</filter>
```

**Fade in/out de áudio:**
```xml
<filter mlt_service="volume" in="0" out="30">
  <property name="gain">0</property>
  <property name="end">1</property>
</filter>
```

**Normalização de loudness:**
```xml
<filter mlt_service="loudness">
  <property name="target_loudness">-23</property>
</filter>
```

### Keyframes para animação

Filtros suportam animação via keyframes com a sintaxe `frame=valor`:

```xml
<filter mlt_service="brightness">
  <property name="level">0=0.5;50=1.0;100=0.5</property>
</filter>

<filter mlt_service="affine">
  <property name="rect">
    0=0%/0%:100%x100%;
    50=10%/10%:80%x80%;
    100=0%/0%:100%x100%
  </property>
</filter>
```

**Sintaxe de interpolação:**
- `frame=value` — interpolação linear
- `frame~=value` — interpolação suave (smooth)

---

## Propriedades específicas do Shotcut

O Shotcut estende o MLT com propriedades prefixadas com `shotcut:` para armazenar metadados de editor e configurações de UI.

### Propriedades obrigatórias para compatibilidade

| Propriedade | Local | Função |
|-------------|-------|--------|
| `shotcut` | Tractor | Valor `1` indica que o Shotcut pode editar este XML |
| `shotcut:video` | Playlist | Valor `1` marca como track de vídeo |
| `shotcut:audio` | Playlist | Valor `1` marca como track de áudio |
| `shotcut:name` | Playlist | Nome da track exibido na UI |

### Propriedades de mídia

| Propriedade | Descrição |
|-------------|-----------|
| `shotcut:hash` | MD5 hash para verificação de mídia. Arquivos < 2MB: hash do arquivo inteiro. Arquivos > 2MB: hash do primeiro MB + último MB |
| `shotcut:caption` | Nome amigável do clip (geralmente o filename) |
| `shotcut:detail` | Caminho absoluto completo (para display na UI) |
| `shotcut:comment` | Comentários/notas do usuário sobre o clip |
| `shotcut:skipConvert` | Valor `1` evita prompt de conversão para arquivos VFR |

### Propriedades de projeto

```xml
<tractor id="tractor0">
  <property name="shotcut">1</property>
  <property name="shotcut:projectAudioChannels">2</property>
  <property name="shotcut:projectFolder">1</property>
  <property name="shotcut:scaleFactor">1.0</property>
  <property name="shotcut:trackHeight">50</property>
</tractor>
```

### Propriedades de filtro

```xml
<filter mlt_service="brightness">
  <property name="shotcut:filter">brightnessContrast</property>
  <property name="shotcut:animIn">30</property>
  <property name="shotcut:animOut">30</property>
</filter>
```

---

## Estrutura completa para Shotcut

Para que o Shotcut reconheça e edite corretamente um arquivo MLT, **três elementos estruturais são obrigatórios**:

### 1. Main Bin Playlist

```xml
<playlist id="main_bin">
  <property name="shotcut:name">Main bin</property>
  <entry producer="chain0"/>
</playlist>
```

### 2. Background Playlist

```xml
<playlist id="background">
  <entry producer="black" in="0" out="999"/>
</playlist>
```

### 3. Tractor com propriedade shotcut

```xml
<tractor id="tractor0" in="0" out="999">
  <property name="shotcut">1</property>
  <multitrack>
    <track producer="background"/>
    <track producer="playlist0"/>
  </multitrack>
</tractor>
```

---

## Código Python completo para geração

### Classe MLTGenerator com xml.etree.ElementTree

```python
import xml.etree.ElementTree as ET
from xml.dom import minidom
import hashlib
import os

class MLTGenerator:
    """Gera arquivos MLT XML compatíveis com Shotcut."""
    
    def __init__(self, width=1920, height=1080, fps_num=30, fps_den=1, title="Untitled"):
        self.width = width
        self.height = height
        self.fps_num = fps_num
        self.fps_den = fps_den
        self.title = title
        
        self.root = ET.Element("mlt")
        self.root.set("LC_NUMERIC", "C")
        self.root.set("version", "7.0.0")
        self.root.set("title", title)
        
        self._producer_count = 0
        self._playlist_count = 0
        self._filter_count = 0
        self._transition_count = 0
        self._total_duration = 0
        
        self._playlists = {}
        
        self._add_profile()
        self._add_black_producer()
        self._add_main_bin()
    
    def _add_property(self, parent, name, value):
        """Adiciona elemento property."""
        prop = ET.SubElement(parent, "property")
        prop.set("name", name)
        prop.text = str(value)
        return prop
    
    def _add_profile(self):
        """Adiciona perfil de vídeo."""
        profile = ET.SubElement(self.root, "profile")
        profile.set("description", f"{self.width}x{self.height} {self.fps_num}/{self.fps_den}fps")
        profile.set("width", str(self.width))
        profile.set("height", str(self.height))
        profile.set("progressive", "1")
        profile.set("sample_aspect_num", "1")
        profile.set("sample_aspect_den", "1")
        profile.set("display_aspect_num", "16")
        profile.set("display_aspect_den", "9")
        profile.set("frame_rate_num", str(self.fps_num))
        profile.set("frame_rate_den", str(self.fps_den))
        profile.set("colorspace", "709")
    
    def _add_black_producer(self):
        """Adiciona producer de cor preta (obrigatório para Shotcut)."""
        producer = ET.SubElement(self.root, "producer")
        producer.set("id", "black")
        self._add_property(producer, "resource", "black")
        self._add_property(producer, "mlt_service", "color")
        self._add_property(producer, "length", "2147483647")
    
    def _add_main_bin(self):
        """Adiciona main bin playlist (obrigatório para Shotcut)."""
        playlist = ET.SubElement(self.root, "playlist")
        playlist.set("id", "main_bin")
        self._add_property(playlist, "shotcut:name", "Main bin")
    
    def calculate_hash(self, filepath):
        """Calcula hash MD5 no formato Shotcut."""
        file_size = os.path.getsize(filepath)
        
        with open(filepath, 'rb') as f:
            if file_size < 2 * 1024 * 1024:  # < 2MB
                return hashlib.md5(f.read()).hexdigest()
            else:
                # Hash do primeiro MB + último MB
                first_mb = f.read(1024 * 1024)
                f.seek(-1024 * 1024, 2)
                last_mb = f.read(1024 * 1024)
                return hashlib.md5(first_mb + last_mb).hexdigest()
    
    def add_producer(self, resource, in_point=None, out_point=None, 
                     caption=None, calculate_hash=False):
        """Adiciona um producer de mídia."""
        producer_id = f"producer{self._producer_count}"
        self._producer_count += 1
        
        producer = ET.SubElement(self.root, "producer")
        producer.set("id", producer_id)
        
        if in_point is not None:
            producer.set("in", str(in_point))
        if out_point is not None:
            producer.set("out", str(out_point))
        
        self._add_property(producer, "resource", resource)
        self._add_property(producer, "mlt_service", "avformat")
        
        # Propriedades Shotcut
        display_name = caption or os.path.basename(resource)
        self._add_property(producer, "shotcut:caption", display_name)
        
        if calculate_hash and os.path.exists(resource):
            hash_value = self.calculate_hash(resource)
            self._add_property(producer, "shotcut:hash", hash_value)
        
        return producer_id
    
    def add_chain(self, resource, in_point=None, out_point=None, caption=None):
        """Adiciona um chain (formato moderno para avformat)."""
        chain_id = f"chain{self._producer_count}"
        self._producer_count += 1
        
        chain = ET.SubElement(self.root, "chain")
        chain.set("id", chain_id)
        
        if in_point is not None:
            chain.set("in", str(in_point))
        if out_point is not None:
            chain.set("out", str(out_point))
        
        self._add_property(chain, "resource", resource)
        self._add_property(chain, "mlt_service", "avformat-novalidate")
        
        display_name = caption or os.path.basename(resource)
        self._add_property(chain, "shotcut:caption", display_name)
        
        return chain_id
    
    def add_color_producer(self, color="black", length=1000, producer_id=None):
        """Adiciona producer de cor sólida."""
        if producer_id is None:
            producer_id = f"color{self._producer_count}"
            self._producer_count += 1
        
        producer = ET.SubElement(self.root, "producer")
        producer.set("id", producer_id)
        self._add_property(producer, "resource", color)
        self._add_property(producer, "mlt_service", "color")
        self._add_property(producer, "length", str(length))
        
        return producer_id
    
    def create_playlist(self, name="V1", is_video=True, is_audio=False):
        """Cria uma playlist (track)."""
        playlist_id = f"playlist{self._playlist_count}"
        self._playlist_count += 1
        
        playlist = ET.SubElement(self.root, "playlist")
        playlist.set("id", playlist_id)
        self._add_property(playlist, "shotcut:name", name)
        
        if is_video:
            self._add_property(playlist, "shotcut:video", "1")
        if is_audio:
            self._add_property(playlist, "shotcut:audio", "1")
        
        self._playlists[playlist_id] = playlist
        return playlist_id
    
    def add_entry(self, playlist_id, producer_id, in_point=0, out_point=None):
        """Adiciona entry a uma playlist."""
        playlist = self._playlists.get(playlist_id)
        if playlist is None:
            raise ValueError(f"Playlist '{playlist_id}' não encontrada")
        
        entry = ET.SubElement(playlist, "entry")
        entry.set("producer", producer_id)
        entry.set("in", str(in_point))
        if out_point is not None:
            entry.set("out", str(out_point))
            
            # Atualiza duração total
            clip_duration = out_point - in_point + 1
            self._total_duration = max(self._total_duration, 
                                       self._get_playlist_duration(playlist))
    
    def add_blank(self, playlist_id, length):
        """Adiciona espaço em branco a uma playlist."""
        playlist = self._playlists.get(playlist_id)
        if playlist is None:
            raise ValueError(f"Playlist '{playlist_id}' não encontrada")
        
        blank = ET.SubElement(playlist, "blank")
        blank.set("length", str(length))
    
    def _get_playlist_duration(self, playlist):
        """Calcula duração total de uma playlist."""
        duration = 0
        for elem in playlist:
            if elem.tag == "entry":
                in_pt = int(elem.get("in", 0))
                out_pt = int(elem.get("out", 0))
                duration += out_pt - in_pt + 1
            elif elem.tag == "blank":
                duration += int(elem.get("length", 0))
        return duration
    
    def add_filter(self, service, track=None, properties=None, 
                   in_point=None, out_point=None, shotcut_filter=None):
        """Adiciona filtro ao tractor."""
        filter_id = f"filter{self._filter_count}"
        self._filter_count += 1
        
        filt = {
            "id": filter_id,
            "service": service,
            "track": track,
            "properties": properties or {},
            "in": in_point,
            "out": out_point,
            "shotcut_filter": shotcut_filter
        }
        
        if not hasattr(self, '_filters'):
            self._filters = []
        self._filters.append(filt)
        
        return filter_id
    
    def add_transition(self, service, a_track, b_track, in_point, out_point,
                       properties=None, shotcut_transition=None):
        """Adiciona transição entre tracks."""
        trans_id = f"transition{self._transition_count}"
        self._transition_count += 1
        
        trans = {
            "id": trans_id,
            "service": service,
            "a_track": a_track,
            "b_track": b_track,
            "in": in_point,
            "out": out_point,
            "properties": properties or {},
            "shotcut_transition": shotcut_transition
        }
        
        if not hasattr(self, '_transitions'):
            self._transitions = []
        self._transitions.append(trans)
        
        return trans_id
    
    def build_tractor(self, track_ids, total_duration=None):
        """Constrói o tractor principal (timeline)."""
        if total_duration is None:
            total_duration = self._total_duration or 1000
        
        # Background playlist
        bg_playlist = ET.SubElement(self.root, "playlist")
        bg_playlist.set("id", "background")
        bg_entry = ET.SubElement(bg_playlist, "entry")
        bg_entry.set("producer", "black")
        bg_entry.set("in", "0")
        bg_entry.set("out", str(total_duration - 1))
        
        # Tractor principal
        tractor = ET.SubElement(self.root, "tractor")
        tractor.set("id", "tractor0")
        tractor.set("in", "0")
        tractor.set("out", str(total_duration - 1))
        
        # Propriedades Shotcut obrigatórias
        self._add_property(tractor, "shotcut", "1")
        self._add_property(tractor, "shotcut:projectAudioChannels", "2")
        
        # Multitrack
        multitrack = ET.SubElement(tractor, "multitrack")
        multitrack.set("id", "multitrack0")
        
        # Background track (sempre primeiro)
        bg_track = ET.SubElement(multitrack, "track")
        bg_track.set("producer", "background")
        
        # Tracks do projeto
        for track_id in track_ids:
            track = ET.SubElement(multitrack, "track")
            track.set("producer", track_id)
        
        # Adicionar transições
        if hasattr(self, '_transitions'):
            for trans in self._transitions:
                transition = ET.SubElement(tractor, "transition")
                transition.set("id", trans["id"])
                transition.set("in", str(trans["in"]))
                transition.set("out", str(trans["out"]))
                
                self._add_property(transition, "a_track", str(trans["a_track"]))
                self._add_property(transition, "b_track", str(trans["b_track"]))
                self._add_property(transition, "mlt_service", trans["service"])
                
                if trans.get("shotcut_transition"):
                    self._add_property(transition, "shotcut:transition", 
                                      trans["shotcut_transition"])
                
                for key, value in trans.get("properties", {}).items():
                    self._add_property(transition, key, value)
        
        # Adicionar filtros
        if hasattr(self, '_filters'):
            for filt in self._filters:
                filter_elem = ET.SubElement(tractor, "filter")
                filter_elem.set("id", filt["id"])
                
                if filt.get("in") is not None:
                    filter_elem.set("in", str(filt["in"]))
                if filt.get("out") is not None:
                    filter_elem.set("out", str(filt["out"]))
                
                self._add_property(filter_elem, "mlt_service", filt["service"])
                
                if filt.get("track") is not None:
                    self._add_property(filter_elem, "track", str(filt["track"]))
                if filt.get("shotcut_filter"):
                    self._add_property(filter_elem, "shotcut:filter", 
                                      filt["shotcut_filter"])
                
                for key, value in filt.get("properties", {}).items():
                    self._add_property(filter_elem, key, value)
        
        return tractor
    
    def to_string(self, pretty=True):
        """Converte para string XML."""
        xml_string = ET.tostring(self.root, encoding="unicode")
        
        if pretty:
            dom = minidom.parseString(xml_string)
            xml_string = dom.toprettyxml(indent="  ")
            # Remove linhas em branco extras
            lines = [line for line in xml_string.split('\n') if line.strip()]
            # Remove declaração duplicada
            lines = [l for l in lines if not l.startswith('<?xml') or lines.index(l) == 0]
            xml_string = '\n'.join(lines)
        
        return '<?xml version="1.0" encoding="utf-8"?>\n' + \
               xml_string.replace('<?xml version="1.0" ?>', '')
    
    def save(self, filepath):
        """Salva arquivo MLT."""
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(self.to_string())
        print(f"Projeto salvo: {filepath}")
```

### Exemplo de uso completo

```python
# Criar projeto Full HD 30fps
mlt = MLTGenerator(
    width=1920, 
    height=1080, 
    fps_num=30, 
    fps_den=1, 
    title="Meu Projeto de Vídeo"
)

# Adicionar clipes de mídia
clip1 = mlt.add_producer("media/intro.mp4", out_point=149, caption="Intro")
clip2 = mlt.add_producer("media/main.mp4", out_point=599, caption="Conteúdo Principal")
clip3 = mlt.add_producer("media/outro.mp4", out_point=89, caption="Encerramento")

# Criar track de vídeo
v1 = mlt.create_playlist(name="V1", is_video=True)

# Adicionar clipes à track
mlt.add_entry(v1, clip1, in_point=0, out_point=149)      # 5 segundos
mlt.add_entry(v1, clip2, in_point=0, out_point=599)      # 20 segundos
mlt.add_blank(v1, length=30)                              # 1 segundo de gap
mlt.add_entry(v1, clip3, in_point=0, out_point=89)       # 3 segundos

# Adicionar transição dissolve entre clips
mlt.add_transition(
    service="luma",
    a_track=1,  # V1 (índice no multitrack, considerando background como 0)
    b_track=1,
    in_point=125,
    out_point=149,
    shotcut_transition="lumaMix"
)

# Adicionar crossfade de áudio correspondente
mlt.add_transition(
    service="mix",
    a_track=1,
    b_track=1,
    in_point=125,
    out_point=149,
    properties={"start": "0.0", "end": "1.0"}
)

# Adicionar filtro de cor
mlt.add_filter(
    service="avfilter.eq",
    track=1,
    properties={
        "av.contrast": "1.1",
        "av.saturation": "1.2"
    }
)

# Construir timeline
mlt.build_tractor(track_ids=[v1], total_duration=900)

# Salvar projeto
mlt.save("meu_projeto.mlt")
```

---

## Organização de pastas para portabilidade

Uma estrutura de pastas bem organizada garante que projetos funcionem em diferentes máquinas.

### Estrutura recomendada

```
meu_projeto/
├── meu_projeto.mlt           # Arquivo de projeto
├── media/                    # Todos os assets
│   ├── video/
│   │   ├── intro.mp4
│   │   └── main.mp4
│   ├── audio/
│   │   └── musica.mp3
│   └── images/
│       └── logo.png
├── proxies/                  # Arquivos proxy (opcional)
└── exports/                  # Vídeos renderizados
```

### Conversão de caminhos para relativos

```python
import os
import re

def convert_paths_to_relative(mlt_content, project_dir):
    """Converte caminhos absolutos para relativos no XML."""
    project_dir = os.path.abspath(project_dir)
    
    def replace_path(match):
        full_tag = match.group(0)
        path = match.group(1)
        
        if os.path.isabs(path):
            try:
                rel_path = os.path.relpath(path, project_dir)
                # Usar forward slashes para compatibilidade
                rel_path = rel_path.replace('\\', '/')
                return f'<property name="resource">{rel_path}</property>'
            except ValueError:
                pass  # Drives diferentes no Windows
        return full_tag
    
    pattern = r'<property name="resource">([^<]+)</property>'
    return re.sub(pattern, replace_path, mlt_content)


def setup_project_folder(project_name, base_dir="."):
    """Cria estrutura de pastas para projeto."""
    project_dir = os.path.join(base_dir, project_name)
    
    folders = [
        project_dir,
        os.path.join(project_dir, "media", "video"),
        os.path.join(project_dir, "media", "audio"),
        os.path.join(project_dir, "media", "images"),
        os.path.join(project_dir, "exports"),
    ]
    
    for folder in folders:
        os.makedirs(folder, exist_ok=True)
    
    return project_dir
```

---

## Renderização com melt

O comando `melt` permite renderizar projetos MLT diretamente pela linha de comando.

### Comandos básicos

```bash
# Reproduzir projeto
melt projeto.mlt

# Renderizar para MP4
melt projeto.mlt -consumer avformat:output.mp4 \
  vcodec=libx264 vb=8M \
  acodec=aac ab=192k

# Com progress bar
melt -progress projeto.mlt -consumer avformat:output.mp4

# Especificar perfil
melt -profile atsc_1080p_30 projeto.mlt -consumer avformat:output.mp4
```

### Renderização via Python

```python
import subprocess

def render_project(mlt_path, output_path, 
                   vcodec="libx264", vbitrate="8M",
                   acodec="aac", abitrate="192k"):
    """Renderiza projeto MLT para vídeo."""
    cmd = [
        "melt", "-progress", mlt_path,
        "-consumer", f"avformat:{output_path}",
        f"vcodec={vcodec}", f"vb={vbitrate}",
        f"acodec={acodec}", f"ab={abitrate}"
    ]
    
    process = subprocess.run(cmd, capture_output=True, text=True)
    
    if process.returncode == 0:
        print(f"Renderização concluída: {output_path}")
        return True
    else:
        print(f"Erro: {process.stderr}")
        return False
```

---

## Validação de arquivos MLT

### Validação estrutural básica

```python
from lxml import etree

def validate_mlt_for_shotcut(mlt_path):
    """Valida estrutura MLT para compatibilidade com Shotcut."""
    try:
        tree = etree.parse(mlt_path)
        root = tree.getroot()
        
        errors = []
        warnings = []
        
        # Verificar elemento raiz
        if root.tag != 'mlt':
            errors.append("Elemento raiz deve ser 'mlt'")
            return False, errors, warnings
        
        # Verificar profile
        if root.find('profile') is None:
            warnings.append("Elemento 'profile' não encontrado")
        
        # Verificar main_bin
        if root.find('playlist[@id="main_bin"]') is None:
            warnings.append("Playlist 'main_bin' não encontrada (recomendado)")
        
        # Verificar background
        if root.find('playlist[@id="background"]') is None:
            warnings.append("Playlist 'background' não encontrada (recomendado)")
        
        # Verificar tractor com propriedade shotcut
        tractor = root.find('.//tractor')
        if tractor is not None:
            shotcut_prop = tractor.find('property[@name="shotcut"]')
            if shotcut_prop is None or shotcut_prop.text != '1':
                errors.append("Tractor deve ter propriedade shotcut=1")
        else:
            errors.append("Elemento 'tractor' não encontrado")
        
        # Verificar producers/chains
        producers = root.findall('.//producer') + root.findall('.//chain')
        if len(producers) == 0:
            warnings.append("Nenhum producer ou chain encontrado")
        
        # Verificar recursos
        for prod in producers:
            resource = prod.find('property[@name="resource"]')
            if resource is not None and resource.text:
                if not resource.text.startswith(('black', 'color:', 'colour:')):
                    # É um arquivo - verificar se é caminho relativo
                    if os.path.isabs(resource.text):
                        warnings.append(
                            f"Caminho absoluto encontrado: {resource.text}"
                        )
        
        is_valid = len(errors) == 0
        return is_valid, errors, warnings
        
    except Exception as e:
        return False, [str(e)], []


# Uso
is_valid, errors, warnings = validate_mlt_for_shotcut("projeto.mlt")

if is_valid:
    print("✓ Arquivo válido para Shotcut")
else:
    print("✗ Erros encontrados:")
    for err in errors:
        print(f"  - {err}")

if warnings:
    print("⚠ Avisos:")
    for warn in warnings:
        print(f"  - {warn}")
```

---

## Exemplo completo: Projeto multi-track com transições

```python
# Projeto completo com múltiplas tracks, transições e filtros
mlt = MLTGenerator(
    width=1920, height=1080, 
    fps_num=30, fps_den=1,
    title="Projeto Multi-Track"
)

# === PRODUCERS ===
bg_music = mlt.add_producer("media/audio/background_music.mp3", 
                            out_point=2999)
clip1 = mlt.add_producer("media/video/scene1.mp4", out_point=299)
clip2 = mlt.add_producer("media/video/scene2.mp4", out_point=299)
clip3 = mlt.add_producer("media/video/scene3.mp4", out_point=299)
lower_third = mlt.add_producer("media/images/lower_third.png")

# === PLAYLISTS (TRACKS) ===
# Track de vídeo principal
v1 = mlt.create_playlist(name="V1", is_video=True)
mlt.add_entry(v1, clip1, in_point=0, out_point=299)
mlt.add_entry(v1, clip2, in_point=0, out_point=299)
mlt.add_entry(v1, clip3, in_point=0, out_point=299)

# Track de overlay (lower third)
v2 = mlt.create_playlist(name="V2 - Overlays", is_video=True)
mlt.add_blank(v2, length=100)
mlt.add_entry(v2, lower_third, in_point=0, out_point=199)
mlt.add_blank(v2, length=600)

# Track de áudio
a1 = mlt.create_playlist(name="A1", is_audio=True)
mlt.add_entry(a1, bg_music, in_point=0, out_point=899)

# === TRANSIÇÕES ===
# Dissolve entre clip1 e clip2
mlt.add_transition("luma", a_track=1, b_track=1, 
                   in_point=275, out_point=299)
mlt.add_transition("mix", a_track=1, b_track=1,
                   in_point=275, out_point=299,
                   properties={"start": "0.0", "end": "1.0"})

# Dissolve entre clip2 e clip3
mlt.add_transition("luma", a_track=1, b_track=1,
                   in_point=575, out_point=599)

# Composite para overlay
mlt.add_transition("qtblend", a_track=1, b_track=2,
                   in_point=100, out_point=299,
                   properties={
                       "rect": "0 80% 100% 20%",
                       "compositing": "0"
                   })

# === FILTROS ===
# Color grading na track de vídeo
mlt.add_filter("avfilter.eq", track=1, properties={
    "av.contrast": "1.05",
    "av.brightness": "0.02",
    "av.saturation": "1.1"
})

# Volume do áudio de fundo
mlt.add_filter("volume", track=3, properties={
    "level": "-6dB"
})

# Fade in de áudio
mlt.add_filter("volume", track=3, in_point=0, out_point=30,
               properties={"gain": "0", "end": "1"})

# === BUILD E SAVE ===
mlt.build_tractor(
    track_ids=[v1, v2, a1],
    total_duration=900
)

mlt.save("projeto_completo.mlt")
```

---

## Hierarquia de elementos MLT

```
mlt (root)
├── profile (configurações de saída)
├── producer / chain (fontes de mídia)
│   ├── property (propriedades)
│   ├── filter (filtros anexados)
│   └── link (apenas chain)
├── playlist (sequência de clips)
│   ├── property
│   ├── entry (referência a producer)
│   └── blank (espaço vazio)
└── tractor (composição multi-track)
    ├── property
    ├── multitrack
    │   └── track (referência a playlist)
    ├── filter (filtros de track/global)
    └── transition (entre tracks)
```

---

## Conclusão

A geração programática de arquivos MLT XML abre um universo de possibilidades para automação de edição de vídeo. Os pontos críticos para criar projetos Shotcut válidos são: incluir a propriedade `shotcut=1` no tractor, criar as playlists `main_bin` e `background`, e usar caminhos relativos para portabilidade. 

O código Python apresentado neste tutorial oferece uma base sólida que pode ser expandida para casos de uso específicos — desde geração em massa de vídeos com templates até integração com sistemas de automação de conteúdo. A combinação do MLTGenerator com o comando `melt` permite criar pipelines completos de produção de vídeo totalmente automatizados.