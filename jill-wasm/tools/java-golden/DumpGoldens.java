import java.awt.image.BufferedImage;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

import org.jill.dma.DmaEntry;
import org.jill.dma.DmaFile;
import org.jill.dma.DmaFileImpl;
import org.jill.jn.BackgroundLayer;
import org.jill.jn.JnFile;
import org.jill.jn.JnFileImpl;
import org.jill.sha.ShaFile;
import org.jill.sha.ShaFileImpl;
import org.jill.sha.ShaTile;
import org.jill.sha.ShaTileSet;

/**
 * Dump OpenJill-decoded tiles and map backgrounds as raw ARGB (.rgba).
 * Same container as native/src/rgba.cpp — used for programmatic pixel compare.
 */
public final class DumpGoldens {
    public static void main(String[] args) throws Exception {
        final String game = args.length > 0 ? args[0] : ".";
        final String outDir = args.length > 1 ? args[1] : "goldens/java";

        new File(outDir + "/tiles").mkdirs();
        new File(outDir + "/maps").mkdirs();

        final ShaFile sha = new ShaFileImpl();
        sha.load(game + File.separator + "JILL1.SHA");

        int tiles = 0;
        for (ShaTileSet ts : sha.getShaTileSet()) {
            ShaTile[] list = ts.getShaTile();
            for (int i = 0; i < list.length; i++) {
                BufferedImage img = list[i].getPictureVga();
                String stem = String.format("ts%03d_tile%03d", ts.getTitleSetIndex(), i);
                writeRgba(new File(outDir + "/tiles/" + stem + ".rgba"), img);
                tiles++;
            }
        }

        final DmaFile dma = new DmaFileImpl();
        dma.load(game + File.separator + "JILL.DMA");

        String[] maps = {"1.JN1", "INTRO.JN1", "MAP.JN1"};
        int mapsN = 0;
        for (String mapName : maps) {
            File mf = new File(game, mapName);
            if (!mf.exists()) continue;
            JnFile jn = new JnFileImpl();
            jn.load(mf.getPath());
            BufferedImage bg = renderBackground(jn, dma, sha);
            String stem = mapName.replace('.', '_') + "_bg";
            writeRgba(new File(outDir + "/maps/" + stem + ".rgba"), bg);
            mapsN++;
        }

        System.out.println("java dump: " + tiles + " tiles, " + mapsN + " maps -> " + outDir);
    }

    private static BufferedImage renderBackground(JnFile jn, DmaFile dma, ShaFile sha) {
        final int w = BackgroundLayer.MAP_WIDTH;
        final int h = BackgroundLayer.MAP_HEIGHT;
        BufferedImage out = new BufferedImage(w * 16, h * 16, BufferedImage.TYPE_INT_ARGB);
        for (int x = 0; x < w; x++) {
            for (int y = 0; y < h; y++) {
                int code = jn.getBackgroundLayer().getMapCode(x, y);
                java.util.Optional<DmaEntry> de = dma.getDmaEntry(code);
                if (!de.isPresent()) continue;
                DmaEntry e = de.get();
                ShaTile tile = findTile(sha, e.getTileset(), e.getTile());
                if (tile == null) continue;
                BufferedImage img = tile.getPictureVga();
                blit(out, x * 16, y * 16, img);
            }
        }
        return out;
    }

    private static ShaTile findTile(ShaFile sha, int tileset, int tile) {
        for (ShaTileSet ts : sha.getShaTileSet()) {
            if (ts.getTitleSetIndex() == tileset) {
                ShaTile[] list = ts.getShaTile();
                if (tile >= 0 && tile < list.length) return list[tile];
                return null;
            }
        }
        return null;
    }

    private static void blit(BufferedImage dst, int dx, int dy, BufferedImage src) {
        for (int y = 0; y < src.getHeight(); y++) {
            for (int x = 0; x < src.getWidth(); x++) {
                int tx = dx + x;
                int ty = dy + y;
                if (tx < 0 || ty < 0 || tx >= dst.getWidth() || ty >= dst.getHeight()) continue;
                int p = src.getRGB(x, y);
                int a = (p >>> 24) & 0xFF;
                if (a == 0) continue;
                dst.setRGB(tx, ty, p);
            }
        }
    }

    private static void writeRgba(File file, BufferedImage img) throws IOException {
        try (DataOutputStream out = new DataOutputStream(new FileOutputStream(file))) {
            writeU32le(out, img.getWidth());
            writeU32le(out, img.getHeight());
            for (int y = 0; y < img.getHeight(); y++) {
                for (int x = 0; x < img.getWidth(); x++) {
                    int p = img.getRGB(x, y);
                    out.writeByte((p >>> 24) & 0xFF);
                    out.writeByte((p >>> 16) & 0xFF);
                    out.writeByte((p >>> 8) & 0xFF);
                    out.writeByte(p & 0xFF);
                }
            }
        }
    }

    private static void writeU32le(DataOutputStream out, int v) throws IOException {
        out.writeByte(v & 0xFF);
        out.writeByte((v >>> 8) & 0xFF);
        out.writeByte((v >>> 16) & 0xFF);
        out.writeByte((v >>> 24) & 0xFF);
    }
}
