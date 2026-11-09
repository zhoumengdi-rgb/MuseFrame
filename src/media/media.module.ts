import { Module } from '@nestjs/common';
import { DescriptionService } from './description.service.js';
import { ImageService } from './image.service.js';
import { MediaService } from './media.service.js';
import { PromptEnhancerService } from './prompt.service.js';
import { VideoService } from './video.service.js';

@Module({
  providers: [ImageService, VideoService, DescriptionService, PromptEnhancerService, MediaService],
  exports: [MediaService],
})
export class MediaModule {}
