// Entity-colored silhouette for rshook. The stock "white" shader
// is rgbGen identity, so shaderRGBA never showed.
rshookglow
{
	nopicmip
	nomipmaps
	cull disable
	{
		map $whiteimage
		blendFunc GL_SRC_ALPHA GL_ONE
		rgbGen entity
		alphaGen entity
	}
}
