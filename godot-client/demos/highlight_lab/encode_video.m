// macOS: clang -fobjc-arc -fblocks encode_video.m -framework Foundation -framework
// AVFoundation -framework AppKit -framework CoreVideo -framework CoreMedia -o /tmp/encode-oil-video
// Usage: /tmp/encode-oil-video frames/ output.mp4 20
#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <AppKit/AppKit.h>
#import <CoreVideo/CoreVideo.h>

int main(int argc, const char **argv) { @autoreleasepool {
    if (argc < 3) return 2;
    NSString *directory = @(argv[1]), *destination = @(argv[2]);
    int fps = argc > 3 ? atoi(argv[3]) : 20;
    NSMutableArray<NSString *> *files = [NSMutableArray array];
    for (NSString *file in [[NSFileManager defaultManager] contentsOfDirectoryAtPath:directory error:nil]) {
        if ([file.pathExtension isEqualToString:@"png"]) [files addObject:file];
    }
    [files sortUsingSelector:@selector(compare:)];
    if (!files.count) return 3;
    NSImage *first = [[NSImage alloc] initWithContentsOfFile:[directory stringByAppendingPathComponent:files[0]]];
    CGImageRef firstCG = [first CGImageForProposedRect:NULL context:nil hints:nil];
    size_t width = CGImageGetWidth(firstCG), height = CGImageGetHeight(firstCG);
    [[NSFileManager defaultManager] removeItemAtPath:destination error:nil];
    NSError *error = nil;
    AVAssetWriter *writer = [[AVAssetWriter alloc] initWithURL:[NSURL fileURLWithPath:destination] fileType:AVFileTypeMPEG4 error:&error];
    AVAssetWriterInput *input = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo outputSettings:@{AVVideoCodecKey:AVVideoCodecTypeH264, AVVideoWidthKey:@(width), AVVideoHeightKey:@(height)}];
    input.expectsMediaDataInRealTime = NO;
    AVAssetWriterInputPixelBufferAdaptor *adaptor = [AVAssetWriterInputPixelBufferAdaptor assetWriterInputPixelBufferAdaptorWithAssetWriterInput:input sourcePixelBufferAttributes:@{(NSString *)kCVPixelBufferPixelFormatTypeKey:@(kCVPixelFormatType_32ARGB), (NSString *)kCVPixelBufferWidthKey:@(width), (NSString *)kCVPixelBufferHeightKey:@(height), (NSString *)kCVPixelBufferCGImageCompatibilityKey:@YES, (NSString *)kCVPixelBufferCGBitmapContextCompatibilityKey:@YES}];
    [writer addInput:input];
    if (![writer startWriting]) { NSLog(@"%@",writer.error); return 4; }
    [writer startSessionAtSourceTime:kCMTimeZero];
    int index = 0;
    for (NSString *file in files) { @autoreleasepool {
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:30];
        while (!input.readyForMoreMediaData) {
            if (writer.status == AVAssetWriterStatusFailed || [deadline timeIntervalSinceNow] < 0) { NSLog(@"%@",writer.error); return 5; }
            [NSThread sleepForTimeInterval:.002];
        }
        NSImage *image = [[NSImage alloc] initWithContentsOfFile:[directory stringByAppendingPathComponent:file]];
        CGImageRef cg = [image CGImageForProposedRect:NULL context:nil hints:nil];
        CVPixelBufferRef buffer = NULL;
        if (CVPixelBufferPoolCreatePixelBuffer(NULL, adaptor.pixelBufferPool, &buffer) != kCVReturnSuccess) return 6;
        CVPixelBufferLockBaseAddress(buffer, 0);
        CGColorSpaceRef color = CGColorSpaceCreateDeviceRGB();
        CGContextRef context = CGBitmapContextCreate(CVPixelBufferGetBaseAddress(buffer), width, height, 8, CVPixelBufferGetBytesPerRow(buffer), color, kCGImageAlphaNoneSkipFirst);
        CGContextDrawImage(context, CGRectMake(0,0,width,height), cg);
        CGContextRelease(context); CGColorSpaceRelease(color);
        CVPixelBufferUnlockBaseAddress(buffer, 0);
        BOOL success = [adaptor appendPixelBuffer:buffer withPresentationTime:CMTimeMake(index++,fps)];
        CVPixelBufferRelease(buffer);
        if (!success) { NSLog(@"%@",writer.error); return 7; }
    }}
    [input markAsFinished];
    dispatch_semaphore_t completion = dispatch_semaphore_create(0);
    [writer finishWritingWithCompletionHandler:^{ dispatch_semaphore_signal(completion); }];
    dispatch_semaphore_wait(completion, dispatch_time(DISPATCH_TIME_NOW,30*NSEC_PER_SEC));
    if (writer.status != AVAssetWriterStatusCompleted) { NSLog(@"%@",writer.error); return 8; }
    printf("Encoded %d frames at %d fps: %s\n",index,fps,argv[2]);
    return 0;
}}
