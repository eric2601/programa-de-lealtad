package mx.lealtad.core.plate

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Size
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.core.UseCaseGroup
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Escáner de placa con la cámara trasera. Lee texto en el dispositivo (ML Kit, sin enviar fotos).
 *
 * Para que sea rápido y preciso:
 *  - analiza solo la franja del marco guía (menos texto que leer y sin "EDOMEX" ni lemas alrededor),
 *  - usa 1280×720 para que la placa tenga suficientes píxeles aun de lejos,
 *  - acepta la placa cuando aparece 2 veces en los últimos 6 cuadros (una lectura mala no reinicia),
 *  - enfoca al centro, permite tocar para enfocar, linterna y acercamiento,
 *  - apaga la cámara en cuanto se cierra el escáner.
 */
/** Colores del escáner: cada app pasa los de su tema. */
data class ScannerColors(val accent: Color, val accentStrong: Color, val muted: Color, val ink: Color)

/**
 * @param text traduce los textos en español (la app del cliente pasa su tr(); la del despachador, nada).
 */
@Composable
fun PlateScanner(onPlate: (String) -> Unit, onClose: () -> Unit, colors: ScannerColors, text: (String) -> String = { it }) {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var denied by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> granted = ok; denied = !ok }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!granted) {
            Text(if (denied) text("Sin permiso de cámara. Escribe la placa a mano o actívalo en Ajustes.") else text("Necesitamos la cámara para leer la placa."), color = colors.muted)
        } else {
            CameraPreview(onPlate, colors, text)
        }
        TextButton(onClick = onClose) { Text(text("Cerrar cámara"), color = colors.accentStrong, fontWeight = FontWeight.Bold) }
    }
}

/** Fracción del área visible que se analiza: un poco más amplia que el marco dibujado. */
private const val GUIDE_WIDTH = 0.92f
private const val GUIDE_HEIGHT = 0.55f

/**
 * Región del marco guía en coordenadas del búfer de la cámara (sin rotar). [visible] es lo que
 * el usuario ve en pantalla; con rotación de 90° o 270° el ancho en pantalla es el alto del búfer.
 */
private fun guideRegion(visible: Rect, rotation: Int, bufferWidth: Int, bufferHeight: Int): Rect {
    val sideways = rotation % 180 != 0
    val w = (visible.width() * if (sideways) GUIDE_HEIGHT else GUIDE_WIDTH).toInt()
    val h = (visible.height() * if (sideways) GUIDE_WIDTH else GUIDE_HEIGHT).toInt()
    val left = (visible.centerX() - w / 2).coerceIn(0, bufferWidth - 1)
    val top = (visible.centerY() - h / 2).coerceIn(0, bufferHeight - 1)
    return Rect(left, top, (left + w).coerceAtMost(bufferWidth), (top + h).coerceAtMost(bufferHeight))
}

/** Votación sobre los últimos cuadros: tolera lecturas sueltas equivocadas sin perder las buenas. */
private class PlateVotes(private val window: Int = 6, private val needed: Int = 2) {
    private val recent = ArrayDeque<String?>()
    fun add(plate: String?): String? {
        recent.addLast(plate)
        if (recent.size > window) recent.removeFirst()
        return plate?.takeIf { p -> recent.count { it == p } >= needed }
    }
    /** La lectura más repetida, para mostrarla mientras se confirma. */
    fun leader(): String? = recent.filterNotNull().groupingBy { it }.eachCount().maxByOrNull { it.value }?.key
}

@SuppressLint("ClickableViewAccessibility")
@Composable
private fun CameraPreview(onPlate: (String) -> Unit, colors: ScannerColors, text: (String) -> String) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val view = remember {
        PreviewView(context).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            implementationMode = PreviewView.ImplementationMode.PERFORMANCE
        }
    }
    val votes = remember { PlateVotes() }
    val done = remember { AtomicBoolean(false) }
    var reading by remember { mutableStateOf<String?>(null) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var torch by remember { mutableStateOf(false) }
    var zoomed by remember { mutableStateOf(false) }

    fun accept(plate: String) {
        if (!done.compareAndSet(false, true)) return
        view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        onPlate(plate)
    }

    DisposableEffect(owner) {
        val executor = Executors.newSingleThreadExecutor()
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val bound = mutableListOf<UseCase>()
        var provider: ProcessCameraProvider? = null
        val alive = AtomicBoolean(true)

        fun analyze(proxy: ImageProxy) {
            if (done.get() || !alive.get()) { proxy.close(); return }
            val rotation = proxy.imageInfo.rotationDegrees
            val frame: Bitmap
            val region: Bitmap
            try {
                frame = proxy.toBitmap()
                val r = guideRegion(proxy.cropRect, rotation, frame.width, frame.height)
                region = Bitmap.createBitmap(frame, r.left, r.top, r.width(), r.height())
                if (region !== frame) frame.recycle()
            } catch (e: Exception) {
                proxy.close(); return
            }
            recognizer.process(InputImage.fromBitmap(region, rotation))
                .addOnSuccessListener { result ->
                    if (done.get()) return@addOnSuccessListener
                    val found = Plate.find(result.textBlocks.flatMap { it.lines }.map { Plate.Line(it.text, it.boundingBox?.height() ?: 0) })
                    val confirmed = votes.add(found)
                    reading = votes.leader()
                    if (confirmed != null) accept(confirmed)
                }
                .addOnCompleteListener { region.recycle(); proxy.close() }
        }

        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            if (!alive.get()) return@addListener
            val p = future.get().also { provider = it }
            val resolution = ResolutionSelector.Builder()
                .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
                .setResolutionStrategy(ResolutionStrategy(Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                .build()
            val preview = Preview.Builder().setResolutionSelector(resolution).build().also { it.setSurfaceProvider(view.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setResolutionSelector(resolution)
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                .build()
                .also { it.setAnalyzer(executor, ::analyze) }
            // Esperar a que la vista tenga tamaño para que el análisis recorte igual que la vista previa.
            view.post {
                if (!alive.get()) return@post
                val group = UseCaseGroup.Builder().addUseCase(preview).addUseCase(analysis)
                view.viewPort?.let { group.setViewPort(it) }
                runCatching {
                    camera = p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, group.build()).also { cam ->
                        val center = view.meteringPointFactory.createPoint(view.width / 2f, view.height / 2f)
                        cam.cameraControl.startFocusAndMetering(FocusMeteringAction.Builder(center).build())
                    }
                    bound += listOf(preview, analysis)
                }
            }
        }, ContextCompat.getMainExecutor(context))

        // Tocar la vista previa enfoca en ese punto.
        view.setOnTouchListener { v, event ->
            if (event.action == MotionEvent.ACTION_UP) {
                val point = view.meteringPointFactory.createPoint(event.x, event.y)
                camera?.cameraControl?.startFocusAndMetering(FocusMeteringAction.Builder(point).setAutoCancelDuration(3, TimeUnit.SECONDS).build())
                v.performClick()
            }
            true
        }

        onDispose {
            alive.set(false)
            camera?.cameraControl?.enableTorch(false)
            provider?.unbind(*bound.toTypedArray())
            executor.shutdown()
            recognizer.close()
            camera = null
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(16.dp)).background(Color.Black)) {
            AndroidView(modifier = Modifier.fillMaxWidth().height(220.dp), factory = { view })
            // Marco guía: la zona que se analiza
            Box(Modifier.align(Alignment.Center).fillMaxWidth(0.8f).height(90.dp).border(BorderStroke(2.dp, colors.accent), RoundedCornerShape(10.dp)))
            Row(Modifier.align(Alignment.TopEnd).padding(6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                ScannerChip(if (zoomed) text("Alejar") else text("Acercar")) {
                    zoomed = !zoomed
                    camera?.cameraControl?.setLinearZoom(if (zoomed) 0.35f else 0f)
                }
                if (camera?.cameraInfo?.hasFlashUnit() == true) {
                    ScannerChip(if (torch) text("Apagar luz") else text("Luz")) {
                        torch = !torch
                        camera?.cameraControl?.enableTorch(torch)
                    }
                }
            }
        }
        val r = reading
        if (r != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(text("Leyendo"), color = colors.muted, fontSize = 13.sp)
                Text(r, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = colors.ink)
                TextButton(onClick = { accept(r) }) { Text(text("Usar esta"), color = colors.accentStrong, fontWeight = FontWeight.Bold) }
            }
        } else {
            Text(text("Pon la placa dentro del marco. Toca la imagen para enfocar."), color = colors.muted, fontSize = 13.sp)
        }
    }
}

@Composable
private fun ScannerChip(text: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.55f)).height(34.dp)) {
        Text(text, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

/** Placa dibujada con letras grandes y, arriba, el tipo de vehículo. */
@Composable
fun PlateTag(plate: String, label: String, accent: Color) {
    Column(
        Modifier.clip(RoundedCornerShape(10.dp)).background(Color.White).border(BorderStroke(2.dp, Color(0xFF1B1B1B)), RoundedCornerShape(10.dp)).padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(label.uppercase(), color = accent, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp)
        Text(plate, color = Color(0xFF1B1B1B), fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace, letterSpacing = 1.sp)
    }
}
