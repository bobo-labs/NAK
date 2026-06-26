import {
  TempNode,
  NodeMaterial,
  NodeUpdateType,
  RenderTarget,
  Vector2,
  HalfFloatType,
  RedFormat,
  QuadMesh,
  RendererUtils,
  Texture,
} from 'three/webgpu';

import {
  convertToTexture,
  nodeObject,
  Fn,
  uniform,
  smoothstep,
  step,
  texture,
  max,
  uniformArray,
  outputStruct,
  property,
  vec4,
  vec3,
  uv,
  Loop,
  min,
  mix,
} from 'three/tsl';

import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

const _quadMesh = /*@__PURE__*/ new QuadMesh();
let _rendererState;

class CustomDepthOfFieldNode extends TempNode {

  static get type() {
    return 'CustomDepthOfFieldNode';
  }

  constructor( textureNode, viewZNode, focusDistanceNode, focalLengthNode, bokehScaleNode, samples1st = 16, samples2nd = 4 ) {
    super( 'vec4' );

    this.textureNode = textureNode;
    this.viewZNode = viewZNode;
    this.focusDistanceNode = focusDistanceNode;
    this.focalLengthNode = focalLengthNode;
    this.bokehScaleNode = bokehScaleNode;
    this.samples1st = samples1st;
    this.samples2nd = samples2nd;

    this._invSize = uniform( new Vector2() );

    this._CoCRT = new RenderTarget( 1, 1, { depthBuffer: false, type: HalfFloatType, format: RedFormat, count: 2 } );
    this._CoCRT.textures[ 0 ].name = 'DepthOfField.NearField';
    this._CoCRT.textures[ 1 ].name = 'DepthOfField.FarField';

    this._CoCBlurredRT = new RenderTarget( 1, 1, { depthBuffer: false, type: HalfFloatType, format: RedFormat } );
    this._CoCBlurredRT.texture.name = 'DepthOfField.NearFieldBlurred';

    this._CoCFarBlurredRT = new RenderTarget( 1, 1, { depthBuffer: false, type: HalfFloatType, format: RedFormat } );
    this._CoCFarBlurredRT.texture.name = 'DepthOfField.FarFieldBlurred';

    this._blur1stRT = new RenderTarget( 1, 1, { depthBuffer: false, type: HalfFloatType } );
    this._blur1stRT.texture.name = 'DepthOfField.Blur1st';

    this._blur2ndNearRT = new RenderTarget( 1, 1, { depthBuffer: false, type: HalfFloatType } );
    this._blur2ndNearRT.texture.name = 'DepthOfField.Blur2ndNear';

    this._blur2ndFarRT = new RenderTarget( 1, 1, { depthBuffer: false, type: HalfFloatType } );
    this._blur2ndFarRT.texture.name = 'DepthOfField.Blur2ndFar';

    this._compositeRT = new RenderTarget( 1, 1, { depthBuffer: false, type: HalfFloatType } );
    this._compositeRT.texture.name = 'DepthOfField.Composite';

    this._CoCMaterial = new NodeMaterial();
    this._CoCBlurredMaterial = new NodeMaterial();
    this._CoCFarBlurredMaterial = new NodeMaterial();
    this._blur1stNearMaterial = new NodeMaterial();
    this._blur2ndNearMaterial = new NodeMaterial();
    this._blur1stFarMaterial = new NodeMaterial();
    this._blur2ndFarMaterial = new NodeMaterial();
    this._compositeMaterial = new NodeMaterial();

    // Enable dithering to prevent banding in blurred gradients and composited layers
    this._blur1stNearMaterial.dithering = true;
    this._blur2ndNearMaterial.dithering = true;
    this._blur1stFarMaterial.dithering = true;
    this._blur2ndFarMaterial.dithering = true;
    this._compositeMaterial.dithering = true;

    this._textureNode = texture( this._compositeRT.texture );
    this._CoCTextureNode = texture( this._CoCRT.texture );
    this._CoCFarBlurredTextureNode = texture( this._CoCFarBlurredRT.texture );
    this._blur1stTextureNode = texture( this._blur1stRT.texture );
    this._blur2ndNearTextureNode = texture( this._blur2ndNearRT.texture );
    this._blur2ndFarTextureNode = texture( this._blur2ndFarRT.texture );

    this.updateBeforeType = NodeUpdateType.FRAME;
  }

  setSize( width, height ) {
    this._invSize.value.set( 1 / width, 1 / height );
    this._CoCRT.setSize( width, height );
    this._compositeRT.setSize( width, height );

    const halfResX = Math.round( width / 2 );
    const halfResY = Math.round( height / 2 );

    this._CoCBlurredRT.setSize( halfResX, halfResY );
    this._CoCFarBlurredRT.setSize( halfResX, halfResY );
    this._blur1stRT.setSize( halfResX, halfResY );
    this._blur2ndNearRT.setSize( halfResX, halfResY );
    this._blur2ndFarRT.setSize( halfResX, halfResY );
  }

  getTextureNode() {
    return this._textureNode;
  }

  updateBefore( frame ) {
    const { renderer } = frame;
    const map = this.textureNode.value;
    this.setSize( map.image.width, map.image.height );

    _rendererState = RendererUtils.resetRendererState( renderer, _rendererState );
    renderer.setClearColor( 0x000000, 0 );

    // coc pass
    _quadMesh.material = this._CoCMaterial;
    renderer.setRenderTarget( this._CoCRT );
    _quadMesh.name = 'DoF [ CoC ]';
    _quadMesh.render( renderer );

    // blur near field CoC (smooth ramp for blend weight at near silhouettes)
    this._CoCTextureNode.value = this._CoCRT.textures[ 0 ];
    _quadMesh.material = this._CoCBlurredMaterial;
    renderer.setRenderTarget( this._CoCBlurredRT );
    _quadMesh.name = 'DoF [ CoC Near Blur ]';
    _quadMesh.render( renderer );

    // blur far field CoC (smooth ramp for blend weight at far silhouettes — eliminates jaggies)
    this._CoCTextureNode.value = this._CoCRT.textures[ 1 ];
    _quadMesh.material = this._CoCFarBlurredMaterial;
    renderer.setRenderTarget( this._CoCFarBlurredRT );
    _quadMesh.name = 'DoF [ CoC Far Blur ]';
    _quadMesh.render( renderer );

    // 1st pass near blur (uses blurred near CoC as kernel guide)
    this._CoCTextureNode.value = this._CoCBlurredRT.texture;
    _quadMesh.material = this._blur1stNearMaterial;
    renderer.setRenderTarget( this._blur1stRT );
    _quadMesh.name = 'DoF [ Blur1st Near ]';
    _quadMesh.render( renderer );

    // 2nd pass near blur
    _quadMesh.material = this._blur2ndNearMaterial;
    renderer.setRenderTarget( this._blur2ndNearRT );
    _quadMesh.name = 'DoF [ Blur2nd Near ]';
    _quadMesh.render( renderer );

    // 1st pass far blur (uses blurred far CoC as kernel guide — prevents sharp CoC in alpha)
    this._CoCTextureNode.value = this._CoCFarBlurredRT.texture;
    _quadMesh.material = this._blur1stFarMaterial;
    renderer.setRenderTarget( this._blur1stRT );
    _quadMesh.name = 'DoF [ Blur1st Far ]';
    _quadMesh.render( renderer );

    // 2nd pass far blur
    _quadMesh.material = this._blur2ndFarMaterial;
    renderer.setRenderTarget( this._blur2ndFarRT );
    _quadMesh.name = 'DoF [ Blur2nd Far ]';
    _quadMesh.render( renderer );

    // composite pass
    _quadMesh.material = this._compositeMaterial;
    renderer.setRenderTarget( this._compositeRT );
    _quadMesh.name = 'DoF [ Composite ]';
    _quadMesh.render( renderer );

    RendererUtils.restoreRendererState( renderer, _rendererState );
  }

  setup( builder ) {
    const nearField = property( 'float' );
    const farField = property( 'float' );
    const outputNode = outputStruct( nearField, farField );

    const CoC = Fn( () => {
      const signedDist = this.viewZNode.negate().sub( this.focusDistanceNode );
      const CoC = smoothstep( 0, this.focalLengthNode, signedDist.abs() );

      nearField.assign( step( signedDist, 0 ).mul( CoC ) );
      farField.assign( step( 0, signedDist ).mul( CoC ) );

      return vec4( 0 );
    } );

    this._CoCMaterial.colorNode = CoC().context( builder.getSharedContext() );
    this._CoCMaterial.outputNode = outputNode;
    this._CoCMaterial.needsUpdate = true;

    // blur near field CoC → smooth ramp at near silhouettes
    this._CoCBlurredMaterial.colorNode = gaussianBlur( this._CoCTextureNode, 1, 2 );
    this._CoCBlurredMaterial.needsUpdate = true;

    // blur far field CoC → smooth ramp at far silhouettes, eliminating jaggies in blendFar
    this._CoCFarBlurredMaterial.colorNode = gaussianBlur( this._CoCTextureNode, 1, 2 );
    this._CoCFarBlurredMaterial.needsUpdate = true;

    // Vogel spiral kernels
    const kernels = {
      points1st: this._generateKernel( this.samples1st ),
      points2nd: this._generateKernel( this.samples2nd ),
    };

    // 1st pass blur kernels
    const bokeh1st = uniformArray( kernels.points1st );
    
    // Near-field 1st pass blur (unweighted, allows foreground blur to spread outwards)
    const blur1stNear = Fn( () => {
      const acc = vec3();
      const uvNode = uv();

      const CoC = this._CoCTextureNode.sample( uvNode ).r;
      const sampleStep = this._invSize.mul( this.bokehScaleNode ).mul( CoC );

      Loop( this.samples1st, ( { i } ) => {
        const sUV = uvNode.add( sampleStep.mul( bokeh1st.element( i ) ) );
        const tap = this.textureNode.sample( sUV );
        acc.addAssign( tap.rgb );
      } );

      acc.divAssign( this.samples1st );
      return vec4( acc, CoC );
    } );

    this._blur1stNearMaterial.fragmentNode = blur1stNear().context( builder.getSharedContext() );
    this._blur1stNearMaterial.needsUpdate = true;

    // Far-field 1st pass blur (weighted by neighbor CoC to prevent in-focus bleeding into the background)
    const blur1stFar = Fn( () => {
      const acc = vec3( 0.0 ).toVar();
      const weightSum = property( 'float' ).toVar();
      weightSum.assign( 0.0 );
      
      const uvNode = uv();
      const CoC = this._CoCTextureNode.sample( uvNode ).r;
      const sampleStep = this._invSize.mul( this.bokehScaleNode ).mul( CoC );

      Loop( this.samples1st, ( { i } ) => {
        const sUV = uvNode.add( sampleStep.mul( bokeh1st.element( i ) ) );
        const tap = this.textureNode.sample( sUV );
        const tapCoC = this._CoCTextureNode.sample( sUV ).r;
        
        const weight = tapCoC.toVar();
        acc.addAssign( tap.rgb.mul( weight ) );
        weightSum.addAssign( weight );
      } );

      const centerTap = this.textureNode.sample( uvNode );
      const safeWeightSum = max( weightSum, 0.00001 );
      acc.assign( mix( centerTap.rgb, acc.div( safeWeightSum ), step( 0.0001, weightSum ) ) );

      return vec4( acc, CoC );
    } );

    this._blur1stFarMaterial.fragmentNode = blur1stFar().context( builder.getSharedContext() );
    this._blur1stFarMaterial.needsUpdate = true;

    // 2nd pass blur kernels
    const bokeh2nd = uniformArray( kernels.points2nd );
    
    // Near-field 2nd pass blur (unweighted max filter)
    const blur2ndNear = Fn( () => {
      const uvNode = uv();
      const col = this._blur1stTextureNode.sample( uvNode ).toVar();
      const maxVal = col.rgb;
      const CoC = col.a;
      const sampleStep = this._invSize.mul( this.bokehScaleNode ).mul( CoC );

      Loop( this.samples2nd, ( { i } ) => {
        const sUV = uvNode.add( sampleStep.mul( bokeh2nd.element( i ) ) );
        const tap = this._blur1stTextureNode.sample( sUV );
        maxVal.assign( max( tap.rgb, maxVal ) );
      } );

      return vec4( maxVal, CoC );
    } );

    this._blur2ndNearMaterial.fragmentNode = blur2ndNear().context( builder.getSharedContext() );
    this._blur2ndNearMaterial.needsUpdate = true;

    // Far-field 2nd pass blur (gated max filter to ignore in-focus neighbor color expansion)
    const blur2ndFar = Fn( () => {
      const uvNode = uv();
      const col = this._blur1stTextureNode.sample( uvNode ).toVar();
      const maxVal = col.rgb;
      const CoC = col.a;
      const sampleStep = this._invSize.mul( this.bokehScaleNode ).mul( CoC );

      Loop( this.samples2nd, ( { i } ) => {
        const sUV = uvNode.add( sampleStep.mul( bokeh2nd.element( i ) ) );
        const tap = this._blur1stTextureNode.sample( sUV );
        const tapCoC = tap.a;
        maxVal.assign( mix( maxVal, max( tap.rgb, maxVal ), step( 0.0001, tapCoC ) ) );
      } );

      return vec4( maxVal, CoC );
    } );

    this._blur2ndFarMaterial.fragmentNode = blur2ndFar().context( builder.getSharedContext() );
    this._blur2ndFarMaterial.needsUpdate = true;

    // composite
    const composite = Fn( () => {
      const uvNode = uv();
      const near = this._blur2ndNearTextureNode.sample( uvNode );
      const far = this._blur2ndFarTextureNode.sample( uvNode );
      const beauty = this.textureNode.sample( uvNode );

      const blendNear = min( near.a, 0.5 ).mul( 2 );
      // Sample the Gaussian-blurred far CoC directly for a smooth gradient blend weight.
      // far.a carries the raw far CoC (sharp step at silhouette = jaggies).
      // _CoCFarBlurredTextureNode carries the Gaussian-blurred far CoC (smooth ramp = no jaggies).
      const blendFar = min( this._CoCFarBlurredTextureNode.sample( uvNode ).r, 0.5 ).mul( 2 );

      const result = vec4( 0, 0, 0, 1 ).toVar();
      result.rgb = mix( beauty.rgb, far.rgb, blendFar );
      result.rgb = mix( result.rgb, near.rgb, blendNear );

      return result;
    } );

    this._compositeMaterial.fragmentNode = composite().context( builder.getSharedContext() );
    this._compositeMaterial.needsUpdate = true;

    return this._textureNode;
  }

  _generateKernel( count ) {
    const GOLDEN_ANGLE = 2.39996323;
    const points = [];
    for ( let i = 0; i < count; i ++ ) {
      const theta = i * GOLDEN_ANGLE;
      const r = Math.sqrt( i ) / Math.sqrt( count );
      points[ i ] = new Vector2( r * Math.cos( theta ), r * Math.sin( theta ) );
    }
    return points;
  }

  dispose() {
    this._CoCRT.dispose();
    this._CoCBlurredRT.dispose();
    this._CoCFarBlurredRT.dispose();
    this._blur1stRT.dispose();
    this._blur2ndNearRT.dispose();
    this._blur2ndFarRT.dispose();
    this._compositeRT.dispose();

    this._CoCMaterial.dispose();
    this._CoCBlurredMaterial.dispose();
    this._CoCFarBlurredMaterial.dispose();
    this._blur1stNearMaterial.dispose();
    this._blur2ndNearMaterial.dispose();
    this._blur1stFarMaterial.dispose();
    this._blur2ndFarMaterial.dispose();
    this._compositeMaterial.dispose();
  }

}

export const customDof = ( node, viewZNode, focusDistance = 1, focalLength = 1, bokehScale = 1, samples1st = 16, samples2nd = 4 ) => 
  new CustomDepthOfFieldNode( 
    convertToTexture( node ), 
    nodeObject( viewZNode ), 
    nodeObject( focusDistance ), 
    nodeObject( focalLength ), 
    nodeObject( bokehScale ), 
    samples1st, 
    samples2nd 
  );
