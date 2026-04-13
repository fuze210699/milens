import { UserDto } from './models.js';
import type { User } from './models.js';

// Simulated NestJS-style decorator usage

@Module({
  imports: [AuthModule],
  controllers: [UserController],
  providers: [
    UserService,
    { provide: APP_GUARD, useClass: RolesGuard },  // object-in-array, depth 4
  ],
})
export class AppModule {}

@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  @Post()
  @ApiBody({ type: UserDto })
  create(@Body() dto: UserDto): Promise<User> {
    return dto as unknown as Promise<User>;
  }
}

@Injectable()
export class UserService {}

@Type(() => UserDto)
export class NestedExample {}

// Middleware applied via method call (not decorator)
export class BodyNormalizeMiddleware {}
function configureMiddleware(consumer: any) {
  consumer.apply(BodyNormalizeMiddleware).forRoutes('*');
}

// These are referenced only via decorators / type annotations / call args above
export class AuthModule {}
export class AuthGuard {}
export class RolesGuard {}
const APP_GUARD = 'APP_GUARD';

function Module(_opts: any) { return (_target: any) => {}; }
function Controller(_path: string) { return (_target: any) => {}; }
function UseGuards(..._guards: any[]) { return (_target: any) => {}; }
function Injectable() { return (_target: any) => {}; }
function Post() { return (_target: any, _key: string) => {}; }
function ApiBody(_opts: any) { return (_target: any, _key: string) => {}; }
function Body() { return (_target: any, _key: string, _idx: number) => {}; }
function Type(_fn: () => any) { return (_target: any) => {}; }
